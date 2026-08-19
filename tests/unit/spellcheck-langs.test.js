/**
 * Testy pickSpellLanguages — výběr jazyků pro Chromium spellchecker.
 */
const { pickSpellLanguages } = require('../../js/spellcheck-langs');

describe('pickSpellLanguages', () => {
    test('vybere češtinu i angličtinu, když jsou dostupné, v preferovaném pořadí', () => {
        const avail = ['en-US', 'de', 'cs', 'sk', 'en-GB'];
        expect(pickSpellLanguages(avail, ['cs', 'en-US'])).toEqual(['cs', 'en-US']);
    });

    test('vynechá nedostupné jazyky', () => {
        expect(pickSpellLanguages(['en-US', 'de'], ['cs', 'en-US'])).toEqual(['en-US']);
    });

    test('žádný preferovaný není dostupný → prázdné pole (necháme výchozí chování)', () => {
        expect(pickSpellLanguages(['de', 'fr'], ['cs', 'en-US'])).toEqual([]);
    });

    test('výchozí preference (bez druhého argumentu) upřednostní češtinu', () => {
        expect(pickSpellLanguages(['en-GB', 'cs', 'en-US'])).toEqual(['cs', 'en-US', 'en-GB']);
    });

    test('odolné vůči nesmyslným vstupům', () => {
        expect(pickSpellLanguages(null, null)).toEqual([]);
        expect(pickSpellLanguages(undefined)).toEqual([]);
        expect(pickSpellLanguages(['cs'], [])).toEqual(['cs']); // prázdné preferred → výchozí, cs projde
    });

    test('nezduplikuje jazyk, když je v preferencích víckrát', () => {
        expect(pickSpellLanguages(['cs', 'en-US'], ['cs', 'cs', 'en-US'])).toEqual(['cs', 'en-US']);
    });
});
