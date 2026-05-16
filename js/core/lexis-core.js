/**
 * LexisCore SDK v1.0
 * Jádro právního editoru LexisEditor.
 * Zapouzdřuje logiku dokumentu, AI a právních nástrojů.
 */
class LexisCore {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = options;
        this.quill = null;
        this.knowledgeBase = JSON.parse(localStorage.getItem('lexis_kb') || '[]');
        this.isTrackChangesActive = false;
        this.scanTimeout = null;
        
        this.init();
    }

    init() {
        // Registrace vlastních Blotů (Právní formáty)
        this.registerBlots();
        
        // Inicializace Quill editoru
        this.quill = new Quill(this.containerId, {
            theme: 'snow',
            modules: {
                toolbar: false,
                keyboard: {
                    bindings: this.getKeyboardBindings()
                }
            }
        });

        // Eventy
        this.quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user' && this.isTrackChangesActive) {
                this.handleTrackChanges(delta);
            }
            this.scheduleAutoTools();
            if (this.options.onTextChange) this.options.onTextChange();
        });
    }

    registerBlots() {
        const Block = Quill.import('blots/block');
        const Inline = Quill.import('blots/inline');

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
        this.quill.root.innerHTML = html || '<p><br></p>';
    }

    getContent() {
        return this.quill.root.innerHTML;
    }

    getText() {
        return this.quill.getText();
    }

    async callAI(prompt, systemPrompt = "Jsi špičkový právní asistent.") {
        if (this.options.aiProvider) {
            return await this.options.aiProvider(prompt, systemPrompt);
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
