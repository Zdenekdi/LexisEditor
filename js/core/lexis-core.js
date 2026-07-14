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

        class InsertionBlot extends Inline {}
        InsertionBlot.blotName = 'insertion';
        InsertionBlot.tagName = 'SPAN';
        InsertionBlot.className = 'ql-insertion';

        class DeletionBlot extends Inline {}
        DeletionBlot.blotName = 'deletion';
        DeletionBlot.tagName = 'SPAN';
        DeletionBlot.className = 'ql-deletion';

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
    }

    getKeyboardBindings() {
        return {
            backspace: {
                key: 'Backspace',
                handler: (range, context) => {
                    if (!this.isTrackChangesActive) return true;
                    if (range.length > 0) {
                        this.quill.formatText(range.index, range.length, 'deletion', true, 'user');
                        this.quill.setSelection(range.index + range.length, 0);
                        return false;
                    } else if (range.index > 0) {
                        this.quill.formatText(range.index - 1, 1, 'deletion', true, 'user');
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
                        this.quill.formatText(range.index, range.length, 'deletion', true, 'user');
                        this.quill.setSelection(range.index, 0);
                        return false;
                    } else {
                        this.quill.formatText(range.index, 1, 'deletion', true, 'user');
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
                this.quill.formatText(index, op.insert.length, 'insertion', true, 'silent');
                index += op.insert.length;
            }
        });
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
            const spis = spisMatch[1];
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
