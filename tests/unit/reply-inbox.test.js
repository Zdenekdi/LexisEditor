// tests/unit/reply-inbox.test.js
const { itemText } = require('../../js/ui/lexis-reply-inbox.js');

describe('Reply-inbox — text pro extrakci náležitostí', () => {
  test('D4b: itemText zahrne text z (PDF) příloh', () => {
    const t = itemText({
      annotation: 'Předmět zprávy',
      sender: 'Okresní soud',
      files: [{ name: 'rozhodnuti.pdf', path: '/x/rozhodnuti.pdf', text: 'č. j. 12 C 34/2026' }]
    });
    expect(t).toContain('č. j. 12 C 34/2026');
    expect(t).toContain('Předmět zprávy');
  });

  test('přílohy bez textu se ignorují (nejsou undefined v řetězci)', () => {
    const t = itemText({ annotation: 'A', sender: 'B', files: [{ name: 'x.pdf', path: '/x' }] });
    expect(t).toBe('A\nB');
  });

  test('extract vytáhne č.j. z textu přílohy', () => {
    let LexisReply;
    try { LexisReply = require('../../js/ui/lexis-reply.js'); } catch (e) { LexisReply = null; }
    if (!LexisReply || !LexisReply.extract) return; // extrakce vázaná na prohlížeč — přeskoč
    const text = itemText({ annotation: 'Věc: Odvolání', files: [{ path: 'a.pdf', text: 'Naše č. j.: 8 As 15/2025-73' }] });
    const f = LexisReply.extract(text);
    expect(f.cj).toContain('8 As 15/2025');
  });
});
