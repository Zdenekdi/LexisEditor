/* global Quill, DOMPurify, localStorage */
/**
 * Utility function to prevent XSS attacks by escaping HTML entities.
 */
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;

/**
 * SecureVault Wrapper
 * Bezpečné ukládání citlivých dat (API klíče, hesla).
 */
class SecureVault {
    constructor() {
        // Fallback bez Electronu: tajemství držíme jen v paměti relace.
        // Do localStorage je NEUKLÁDÁME — base64 (btoa) není šifrování a byla by
        // čitelná z konzole/XSS; navíc btoa padá na Unicode. Trvalé bezpečné
        // uložení zajišťuje pouze desktopová verze přes safeStorage.
        this._memoryStore = {};
    }

    async save(key, value) {
        if (window.electronAPI && window.electronAPI.saveAIConfig) {
            const config = await this.getAll();
            config[key] = value;
            return await window.electronAPI.saveAIConfig(config);
        }
        this._memoryStore[key] = value;
        // Úklid případného starého nešifrovaného záznamu.
        try { localStorage.removeItem(`secure_${key}`); } catch (e) {}
        console.warn('[SecureVault] Bez desktopové verze se citlivé klíče neukládají trvale (pouze pro tuto relaci).');
        return true;
    }

    async get(key) {
        if (window.electronAPI && window.electronAPI.getAIConfig) {
            const config = await window.electronAPI.getAIConfig();
            return config ? config[key] : null;
        }
        return Object.prototype.hasOwnProperty.call(this._memoryStore, key) ? this._memoryStore[key] : null;
    }

    async getAll() {
        if (window.electronAPI && window.electronAPI.getAIConfig) {
            return await window.electronAPI.getAIConfig() || {};
        }
        return { ...this._memoryStore };
    }
}
window.SecureVault = SecureVault;

/**
 * LexisCore SDK v1.0
 * Jádro právního editoru LexisEditor.
 */
class LexisCore {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = options;
        this.quill = null;
        this.storage = new LexisStorage();
        this.knowledgeBase = [];
        this.isTrackChangesActive = false;
        this.scanTimeout = null;
        this.secureVault = new SecureVault();
        
        this.init();
    }

    init() {
        this.registerBlots();

        // Inicializace lokální databáze (IndexedDB). Bez tohoto volání zůstane
        // this.storage.db === null a všechny DB operace (kontakty, dokumenty,
        // doložky) skončí chybou „Databáze není inicializována".
        this.storageReady = this.storage.init().catch(err => {
            console.error('[LexisCore] Inicializace úložiště selhala:', err);
        });

        this.quill = new Quill(this.containerId, {
            theme: 'snow',
            modules: {
                toolbar: false,
                keyboard: {
                    bindings: this.getKeyboardBindings()
                },
                clipboard: {
                    matchers: [
                        [Node.ELEMENT_NODE, (node, delta) => {
                            if (typeof DOMPurify !== 'undefined' && node.innerHTML) {
                                node.innerHTML = DOMPurify.sanitize(node.innerHTML);
                            } else if (node.innerHTML) {
                                console.error("DOMPurify is missing! Sanitization bypassed in clipboard matcher.");
                                node.innerHTML = "";
                            }
                            return delta;
                        }]
                    ]
                }
            }
        });

        this.quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user' && this.isTrackChangesActive) {
                this.handleTrackChanges(delta);
            }
            this.scheduleAutoTools();
            if (this.options.onTextChange) this.options.onTextChange();
        });

        // Sanitizace vkládaného obsahu PŘED parsováním Quillem (obrana proti XSS).
        // Clipboard matcher sanitizuje až po sestavení delty, což je pozdě; proto
        // vložené HTML nejdřív pročistíme DOMPurify a teprve pak vložíme.
        this.quill.root.addEventListener('paste', (e) => {
            try {
                if (!e.clipboardData) return;
                const html = e.clipboardData.getData('text/html');
                if (!html) return; // prostý text nenese XSS — necháme Quill
                e.preventDefault();
                e.stopPropagation();
                let clean = html;
                if (typeof DOMPurify !== 'undefined') {
                    clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
                } else {
                    // Bez DOMPurify vložíme jen prostý text (bezpečné).
                    const tmp = document.createElement('div');
                    tmp.innerHTML = html;
                    clean = (tmp.textContent || '').replace(/[<>&]/g, '');
                }
                const range = this.quill.getSelection(true) || { index: this.quill.getLength(), length: 0 };
                if (range.length) this.quill.deleteText(range.index, range.length, 'user');
                this.quill.clipboard.dangerouslyPasteHTML(range.index, clean, 'user');
            } catch (err) {
                console.error('[LexisCore] Chyba při sanitizaci vloženého obsahu:', err);
            }
        }, true);
    }

    registerBlots() {
        const Block = Quill.import('blots/block');
        const Inline = Quill.import('blots/inline');
        const Parchment = Quill.import('parchment');

        const LineHeightStyle = new Parchment.Attributor.Style('lineheight', 'line-height', {
            scope: Parchment.Scope.BLOCK,
            whitelist: ['1.0', '1.15', '1.5', '2.0', 'normal']
        });
        Quill.register(LineHeightStyle, true);

        // Rodina písma jako inline style (bez whitelistu) — umožní libovolné
        // písmo z ribbonu (výchozí Quill 'font' je class-based jen serif/monospace).
        const FontStyle = new Parchment.Attributor.Style('font', 'font-family', {
            scope: Parchment.Scope.INLINE
        });
        Quill.register(FontStyle, true);

        // Velikost písma jako inline style v px (výchozí Quill 'size' whitelist
        // neumožňuje px hodnoty).
        const SizeStyle = new Parchment.Attributor.Style('size', 'font-size', {
            scope: Parchment.Scope.INLINE
        });
        Quill.register(SizeStyle, true);

        class ArticleBlot extends Block {}
        ArticleBlot.blotName = 'article';
        ArticleBlot.tagName = 'P';
        ArticleBlot.className = 'ql-article';

        class SectionBlot extends Block {}
        SectionBlot.blotName = 'legal-section';
        SectionBlot.tagName = 'P';
        SectionBlot.className = 'ql-legal-section';

        // Sledované změny nesou AUTORA a DATUM (Word je vyžaduje u w:ins/w:date).
        // Hodnota formátu je objekt {author,date,id}; pro zpětnou kompatibilitu se
        // starým boolean vrací `true`, když metadata chybí.
        function _changeCreate(node, value) {
            if (value && typeof value === 'object') {
                if (value.author) node.setAttribute('data-author', value.author);
                if (value.date) node.setAttribute('data-date', value.date);
                if (value.id) node.setAttribute('data-cid', value.id);
            }
            return node;
        }
        function _changeFormats(node) {
            const v = {};
            if (node.getAttribute('data-author')) v.author = node.getAttribute('data-author');
            if (node.getAttribute('data-date')) v.date = node.getAttribute('data-date');
            if (node.getAttribute('data-cid')) v.id = node.getAttribute('data-cid');
            return Object.keys(v).length ? v : true;
        }
        class InsertionBlot extends Inline {
            static create(value) { const n = super.create(); n.classList.add('ql-insertion'); return _changeCreate(n, value); }
            static formats(node) { return _changeFormats(node); }
        }
        InsertionBlot.blotName = 'insertion';
        InsertionBlot.tagName = 'SPAN';
        InsertionBlot.className = 'ql-insertion';

        class DeletionBlot extends Inline {
            static create(value) { const n = super.create(); n.classList.add('ql-deletion'); return _changeCreate(n, value); }
            static formats(node) { return _changeFormats(node); }
        }
        DeletionBlot.blotName = 'deletion';
        DeletionBlot.tagName = 'SPAN';
        DeletionBlot.className = 'ql-deletion';

        // Blok automatického obsahu (TOC) — do .docx se exportuje jako pole { TOC },
        // které Word po otevření přepočítá (viz delta-to-model / model-to-docx).
        const BlockEmbed = Quill.import('blots/block/embed');
        class TocBlot extends BlockEmbed {
            static create() {
                const node = super.create();
                node.setAttribute('contenteditable', 'false');
                node.classList.add('lexis-toc');
                node.innerHTML = '<div style="border:1px dashed #b9b3a8;border-radius:8px;padding:10px 14px;color:#6b6459;font-size:13px;background:#faf9f7;">📖 Automatický obsah — vygeneruje se ve Wordu po otevření (pole { TOC }).</div>';
                return node;
            }
        }
        TocBlot.blotName = 'toc';
        TocBlot.tagName = 'DIV';
        TocBlot.className = 'lexis-toc';

        // Komentář (recenzní bublina) — nese text, autora, datum; exportuje se jako
        // Word komentář (word/comments.xml). Render: zvýrazněný rozsah s tooltipem.
        class CommentBlot extends Inline {
            static create(value) {
                const n = super.create();
                n.classList.add('comment-highlight');
                if (value && typeof value === 'object') {
                    if (value.id) n.setAttribute('data-comment-id', value.id);
                    if (value.text) n.setAttribute('data-comment-text', value.text);
                    if (value.author) n.setAttribute('data-comment-author', value.author);
                    if (value.date) n.setAttribute('data-comment-date', value.date);
                    n.setAttribute('title', (value.author ? value.author + ': ' : '') + (value.text || ''));
                }
                return n;
            }
            static formats(node) {
                const v = {};
                if (node.getAttribute('data-comment-id')) v.id = node.getAttribute('data-comment-id');
                if (node.getAttribute('data-comment-text')) v.text = node.getAttribute('data-comment-text');
                if (node.getAttribute('data-comment-author')) v.author = node.getAttribute('data-comment-author');
                if (node.getAttribute('data-comment-date')) v.date = node.getAttribute('data-comment-date');
                return Object.keys(v).length ? v : true;
            }
        }
        CommentBlot.blotName = 'comment';
        CommentBlot.tagName = 'SPAN';
        CommentBlot.className = 'comment-highlight';

        // Tabulka jako blok (BlockEmbed) — Quill jinak <table> zahodí. Buňky jsou
        // editovatelné (contenteditable); hodnota nese mřížku textů. Export přes
        // html-to-docx (HTML tabulka) i nativní OOXML (viz model-to-docx buildTable).
        class TableBlot extends BlockEmbed {
            static create(value) {
                const node = super.create();
                node.classList.add('lexis-table');
                node.setAttribute('contenteditable', 'false');
                const rows = (value && Array.isArray(value.rows) && value.rows.length) ? value.rows : [['', ''], ['', '']];
                let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;" border="1">';
                rows.forEach(r => {
                    html += '<tr>';
                    (r || []).forEach(c => {
                        const safe = (c == null ? '' : String(c)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        html += '<td contenteditable="true" style="border:1px solid #999;padding:4px 8px;min-width:48px;">' + safe + '</td>';
                    });
                    html += '</tr>';
                });
                html += '</table>';
                node.innerHTML = html;
                return node;
            }
            static value(node) {
                const rows = [];
                node.querySelectorAll('tr').forEach(tr => {
                    const cells = [];
                    tr.querySelectorAll('td').forEach(td => cells.push(td.innerText));
                    rows.push(cells);
                });
                return { rows: rows.length ? rows : [['']] };
            }
        }
        TableBlot.blotName = 'table';
        TableBlot.tagName = 'DIV';
        TableBlot.className = 'lexis-table';

        class PlaceholderBlot extends Inline {
            static create(value) {
                let node = super.create();
                node.setAttribute('data-id', value.id || 'ph-' + Date.now());
                node.setAttribute('data-name', value.name || '');
                node.setAttribute('data-value', value.value || value.name || '');
                node.classList.add('placeholder-highlight');
                node.innerText = value.value || `[${value.name}]`;
                return node;
            }
            static value(node) {
                return {
                    id: node.getAttribute('data-id'),
                    name: node.getAttribute('data-name'),
                    value: node.getAttribute('data-value')
                };
            }
        }
        PlaceholderBlot.blotName = 'placeholder';
        PlaceholderBlot.tagName = 'span';

        class CitationBlot extends Inline {
            static create(value) {
                let node = super.create();
                node.setAttribute('data-url', value.url);
                node.classList.add('citation-highlight');
                node.innerText = value.text;
                node.onclick = () => window.open(value.url, '_blank');
                return node;
            }
            static value(node) {
                return { url: node.getAttribute('data-url'), text: node.innerText };
            }
        }
        CitationBlot.blotName = 'citation';
        CitationBlot.tagName = 'span';

        class FootnoteBlot extends Inline {
            static create(value) {
                let node = super.create();
                node.setAttribute('data-id', value.id || 'fn-' + Date.now());
                node.setAttribute('data-text', value.text || '');
                node.setAttribute('title', value.text || '');
                node.classList.add('footnote-ref');
                node.innerText = value.number || '?';
                return node;
            }
            static value(node) {
                return { id: node.getAttribute('data-id'), text: node.getAttribute('data-text'), number: node.innerText };
            }
        }
        FootnoteBlot.blotName = 'footnote';
        FootnoteBlot.tagName = 'sup';

        Quill.register(ArticleBlot);
        Quill.register(SectionBlot);
        Quill.register(InsertionBlot);
        Quill.register(DeletionBlot);
        Quill.register(PlaceholderBlot);
        Quill.register(CitationBlot);
        Quill.register(FootnoteBlot);
        Quill.register(TocBlot);
        Quill.register(CommentBlot);
        Quill.register(TableBlot);
    }

    getKeyboardBindings() {
        return {
            backspace: {
                key: 'Backspace',
                handler: (range, context) => {
                    if (!this.isTrackChangesActive) return true;
                    if (range.length > 0) {
                        this.quill.formatText(range.index, range.length, 'deletion', this._changeMeta(), 'user');
                        this.quill.setSelection(range.index + range.length, 0);
                        return false;
                    } else if (range.index > 0) {
                        this.quill.formatText(range.index - 1, 1, 'deletion', this._changeMeta(), 'user');
                        return false;
                    }
                    return true;
                }
            },
            delete: {
                key: 'Delete',
                handler: (range, context) => {
                    if (!this.isTrackChangesActive) return true;
                    if (range.length > 0) {
                        this.quill.formatText(range.index, range.length, 'deletion', this._changeMeta(), 'user');
                        this.quill.setSelection(range.index, 0);
                        return false;
                    } else {
                        this.quill.formatText(range.index, 1, 'deletion', this._changeMeta(), 'user');
                        return false;
                    }
                }
            }
        };
    }

    handleTrackChanges(delta) {
        let index = 0;
        delta.ops.forEach(op => {
            if (op.retain) index += op.retain;
            if (op.insert && typeof op.insert === 'string') {
                this.quill.formatText(index, op.insert.length, 'insertion', this._changeMeta(), 'silent');
                index += op.insert.length;
            }
        });
    }

    // Metadata sledované změny (autor + čas). Autora nastavuje UI z profilu advokáta
    // (this.trackAuthor); bez něj se použije neutrální „Advokát".
    _changeMeta() {
        return {
            author: this.trackAuthor || 'Advokát',
            date: new Date().toISOString(),
            id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        };
    }

    // Přijmout/odmítnout VŠECHNY sledované změny. Přijmout: vložení → normální text,
    // smazání → text pryč. Odmítnout: vložení → text pryč, smazání → text zůstává.
    _resolveAllChanges(mode) {
        const Delta = Quill.import('delta');
        const contents = this.quill.getContents();
        const out = new Delta();
        contents.ops.forEach(op => {
            const a = Object.assign({}, op.attributes || {});
            const isIns = !!a.insertion, isDel = !!a.deletion;
            if (mode === 'accept') {
                if (isDel) return;
                delete a.insertion;
            } else {
                if (isIns) return;
                delete a.deletion;
            }
            out.push({ insert: op.insert, attributes: Object.keys(a).length ? a : undefined });
        });
        this.quill.setContents(out, 'user');
    }
    acceptAllChanges() { this._resolveAllChanges('accept'); }
    rejectAllChanges() { this._resolveAllChanges('reject'); }

    // Přijmout/odmítnout jednu změnu pod kurzorem.
    _resolveChangeAtCursor(mode) {
        const sel = this.quill.getSelection();
        if (!sel) return;
        const contents = this.quill.getContents();
        let idx = 0, target = null;
        for (const op of contents.ops) {
            const len = typeof op.insert === 'string' ? op.insert.length : 1;
            const a = op.attributes || {};
            if ((a.insertion || a.deletion) && sel.index >= idx && sel.index <= idx + len) {
                target = { start: idx, len: len, ins: !!a.insertion };
                break;
            }
            idx += len;
        }
        if (!target) return;
        const removeText = (mode === 'accept') ? !target.ins : target.ins;
        if (removeText) {
            this.quill.deleteText(target.start, target.len, 'user');
        } else {
            this.quill.formatText(target.start, target.len, target.ins ? 'insertion' : 'deletion', false, 'user');
        }
    }
    acceptChangeAtCursor() { this._resolveChangeAtCursor('accept'); }
    rejectChangeAtCursor() { this._resolveChangeAtCursor('reject'); }

    // Vloží komentář (recenzní bublinu) k aktuálnímu výběru. Vrací false bez výběru.
    insertComment(text) {
        const range = this.quill.getSelection();
        if (!range || range.length === 0) return false;
        const meta = {
            id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            text: String(text || ''),
            author: this.trackAuthor || 'Advokát',
            date: new Date().toISOString()
        };
        this.quill.formatText(range.index, range.length, 'comment', meta, 'user');
        return true;
    }

    // AI redline: nahradí VÝBĚR (nebo daný rozsah) revidovaným zněním jako SLEDOVANÉ
    // ZMĚNY (ql-insertion / ql-deletion). Staví na LexisCompare (diff po slovech), takže
    // původní text zůstane přeškrtnutý a nový podtržený — advokát je pak přijme/odmítne
    // v recenzním panelu. Autora/datum zapíšeme do blotů, takže export do w:ins/w:del je
    // zachovává. Vrací true při úspěchu; false, když není výběr nebo chybí modul.
    // opts: { range?, author?, compare? } — compare kvůli testovatelnosti bez window.
    insertRedlineFromRevision(revisedText, opts) {
        opts = opts || {};
        const LC = opts.compare || (typeof window !== 'undefined' ? window.LexisCompare : null);
        if (!LC || typeof LC.compareTexts !== 'function') {
            console.error('LexisCompare (compare.js) není načten — nelze vytvořit AI revizi.');
            return false;
        }
        const range = opts.range || this.quill.getSelection(true);
        if (!range || range.length === 0) return false;

        const index = range.index;
        const len = range.length;
        const original = this.quill.getText(index, len);
        if (original == null || original === '') return false;

        const author = opts.author || this.trackAuthor || 'AI asistent';
        // Sestavení redline + „inline" odstavcové odlehčení řeší compare.js (čistá,
        // testovatelná funkce). changed=false ⇒ AI vrátila stejné znění → nevkládáme.
        const rl = (typeof LC.buildRedline === 'function')
            ? LC.buildRedline(original, revisedText, { author: author, date: new Date().toISOString() })
            : { html: LC.compareTexts(original, revisedText, { author: author, date: new Date().toISOString() }), changed: true };
        if (!rl.changed || !rl.html) return false;

        this.quill.deleteText(index, len, 'user');
        this.safePasteHTML(index, rl.html);
        return true;
    }

    // Seznam revizních položek (vložení / smazání / komentáře) s autorem, časem,
    // textem a pozicí — podklad pro recenzní panel. Souvislé běhy se slučují.
    listReviewItems() {
        const contents = this.quill.getContents();
        const items = [];
        let idx = 0, cur = null;
        const flush = () => { if (cur) { items.push(cur); cur = null; } };
        contents.ops.forEach(op => {
            const len = typeof op.insert === 'string' ? op.insert.length : 1;
            const a = op.attributes || {};
            const text = typeof op.insert === 'string' ? op.insert : '';
            let kind = null, meta = null;
            if (a.insertion) { kind = 'ins'; meta = typeof a.insertion === 'object' ? a.insertion : {}; }
            else if (a.deletion) { kind = 'del'; meta = typeof a.deletion === 'object' ? a.deletion : {}; }
            else if (a.comment) { kind = 'comment'; meta = typeof a.comment === 'object' ? a.comment : {}; }
            if (kind) {
                const key = kind + '|' + (meta.id || '') + '|' + (meta.author || '');
                if (cur && cur.key === key && cur.end === idx) {
                    cur.text += text; cur.end = idx + len;
                } else {
                    flush();
                    cur = { key: key, kind: kind, author: meta.author || 'Advokát', date: meta.date || '', text: text, commentText: meta.text || '', start: idx, end: idx + len };
                }
            } else {
                flush();
            }
            idx += len;
        });
        flush();
        return items;
    }

    // Vyřeší jednu revizní položku (z panelu). U komentáře „accept" = vyřešit/odebrat.
    resolveReviewItem(item, mode) {
        if (!item) return;
        const len = item.end - item.start;
        if (item.kind === 'comment') {
            this.quill.formatText(item.start, len, 'comment', false, 'user');
            return;
        }
        const removeText = (mode === 'accept') ? (item.kind === 'del') : (item.kind === 'ins');
        if (removeText) {
            this.quill.deleteText(item.start, len, 'user');
        } else {
            this.quill.formatText(item.start, len, item.kind === 'ins' ? 'insertion' : 'deletion', false, 'user');
        }
    }

    // Stabilní barva pro autora revize (pro barevné odlišení v panelu i textu).
    authorColor(author) {
        const palette = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#d97706', '#0891b2', '#be185d'];
        let h = 0;
        const s = String(author || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return palette[h % palette.length];
    }

    // Vloží tabulku (mřížka prázdných buněk) na pozici kurzoru.
    insertTable(rows, cols) {
        const r = Math.max(1, Math.min(parseInt(rows, 10) || 3, 50));
        const c = Math.max(1, Math.min(parseInt(cols, 10) || 3, 12));
        const grid = Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
        const range = this.quill.getSelection(true);
        const index = range ? range.index : this.quill.getLength();
        this.quill.insertEmbed(index, 'table', { rows: grid }, 'user');
        this.quill.setSelection(index + 1, 0);
    }

    // Vloží blok automatického obsahu (TOC) na pozici kurzoru.
    insertTableOfContents() {
        const range = this.quill.getSelection(true);
        const index = range ? range.index : this.quill.getLength();
        this.quill.insertEmbed(index, 'toc', true, 'user');
        this.quill.setSelection(index + 1, 0);
    }

    insertFootnote(text) {
        const range = this.quill.getSelection(true);
        const id = 'fn-' + Date.now();
        this.quill.insertEmbed(range.index, 'footnote', { 
            id: id, 
            text: text, 
            number: '?' 
        });
        this.updateFootnoteNumbers();
    }

    scheduleAutoTools() {
        clearTimeout(this.scanTimeout);
        this.scanTimeout = setTimeout(() => {
            this.updateFootnoteNumbers();
            if (this.options.onAutoScan) this.options.onAutoScan();
        }, 1500);
    }

    setContent(html) {
        let processHtml = html || '';
        
        // Zpracování AI metadat pro spisovou značku
        const spisMatch = processHtml.match(/<meta\s+data-spis=["']([^"']+)["']\s*\/?>/i);
        if (spisMatch && spisMatch[1]) {
            // BEZPEČNOST: data-spis může přijít z nedůvěryhodného HTML (LexisConnect,
            // datová zpráva) a vkládá se do innerHTML PŘED DOMPurify — bez escapování
            // by `data-spis="<img onerror=…>"` obešel sanitizaci (XSS).
            const spis = escapeHTML(spisMatch[1]);
            processHtml = processHtml.replace(spisMatch[0], '');
            
            const updateSpis = (el) => {
                if (!el) return;
                const htmlContent = el.innerHTML;
                const updated = htmlContent.replace(/(Spis:|Sp\. zn\.:|č\. j\.|K č\. j\. \/ sp\. zn\.:|K sp\. zn\.:)\s*([^<]+)/i, `$1 ${spis}`);
                if (updated !== htmlContent) {
                    el.innerHTML = updated;
                }
            };
            
            updateSpis(document.getElementById('header-area'));
            updateSpis(document.getElementById('footer-area'));
        }

        if (typeof DOMPurify === 'undefined') {
            console.error("DOMPurify is missing! Cannot safely set content.");
            this.quill.root.innerHTML = '<p><br></p>';
            return;
        }

        const cleanHtml = DOMPurify.sanitize(processHtml);
        this.quill.root.innerHTML = cleanHtml || '<p><br></p>';
    }

    safePasteHTML(index, html) {
        if (typeof DOMPurify === 'undefined') {
            console.error("DOMPurify is missing! Aborting paste to prevent XSS.");
            return;
        }
        const cleanHtml = DOMPurify.sanitize(html);
        this.quill.clipboard.dangerouslyPasteHTML(index, cleanHtml);
    }

    getContent() {
        return this.quill.root.innerHTML;
    }

    getText() {
        return this.quill.getText();
    }

    async callAI(prompt, systemPrompt = "Jsi špičkový právní asistent.") {
        if (this.options.aiProvider) {
            try {
                return await this.options.aiProvider(prompt, systemPrompt);
            } catch (error) {
                console.error("AI Provider Error:", error);
                return "Chyba AI poskytovatele.";
            }
        }
        return "AI Provider not configured.";
    }

    async anonymize(mode = 'smart') {
        const text = this.getText();
        if (mode === 'smart') {
            const response = await this.callAI(`Najdi jména, firmy, adresy v textu: ${text.substring(0, 2000)}`, "Vracej JSON pole stringů.");
            try {
                const entities = JSON.parse(response);
                entities.forEach(e => this.applyRedaction(e));
                return entities.length;
            } catch (e) { return 0; }
        }
        return 0;
    }

    applyRedaction(targetText) {
        const fullText = this.getText();
        let offset = 0;
        while (true) {
            const index = fullText.indexOf(targetText, offset);
            if (index === -1) break;
            this.quill.formatText(index, targetText.length, { 'background': '#000', 'color': '#000' }, 'user');
            offset = index + targetText.length;
        }
    }

    updateFootnoteNumbers() {
        const refs = Array.from(document.querySelectorAll('.footnote-ref'));
        if (refs.length === 0) return;
        refs.sort((a, b) => {
            const blotA = Quill.find(a);
            const blotB = Quill.find(b);
            if (!blotA || !blotB) return 0;
            return blotA.offset(this.quill.scroll) - blotB.offset(this.quill.scroll);
        });
        refs.forEach((node, index) => { node.innerText = index + 1; });
    }
}
window.LexisCore = LexisCore;
