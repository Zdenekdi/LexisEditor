const { itemText } = require('../../js/ui/lexis-reply-inbox');

describe('lexis-reply-inbox.itemText', () => {
    test('spojí předmět, odesílatele a texty příloh; vynechá prázdné', () => {
        const t = itemText({
            annotation: 'Předvolání k jednání',
            sender: 'Okresní soud v Brně',
            senderId: '',
            files: [{ name: 'a.pdf', text: 'sp. zn. 12 C 34/2025' }, { name: 'b.pdf' }]
        });
        expect(t).toContain('Předvolání k jednání');
        expect(t).toContain('Okresní soud v Brně');
        expect(t).toContain('sp. zn. 12 C 34/2025');
        expect(t.split('\n').length).toBe(3); // prázdný senderId a soubor bez text vynechány
    });

    test('prázdný/undefined vstup nespadne', () => {
        expect(itemText()).toBe('');
        expect(itemText({})).toBe('');
    });
});
