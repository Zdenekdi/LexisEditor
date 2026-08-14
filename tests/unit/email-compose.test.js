// tests/unit/email-compose.test.js
// Regresní pojistka pro escapování skriptů „nové okno pošty s přílohou".
// Spouští se přes execFile (bez shellu), takže stačí korektní escapování do
// AppleScriptu / PowerShellu — tento test ho hlídá.
const ec = require('../../js/core/email-compose-script.js');

describe('E-mail compose — escapování (proti injection)', () => {
  test('AppleScript: uvozovky a zpětná lomítka se escapují', () => {
    expect(ec.escAppleScript('a"b\\c')).toBe('a\\"b\\\\c');
  });

  test('AppleScript: subject se zlomyslným " nerozbije řetězec', () => {
    const s = ec.buildAppleMailScript({
      to: 'x@y.cz',
      subject: '"; do shell script "rm -rf /" --',
      body: 'ahoj'
    });
    // Uvozovky z payloadu musí být escapované (\"), takže nemůžou uzavřít
    // AppleScript řetězec a spustit „do shell script".
    expect(s).toContain('\\"; do shell script \\"rm -rf /\\" --');
    expect(s).not.toMatch(/subject:"";/); // nedošlo k předčasnému uzavření
  });

  test('AppleScript: víceřádkové tělo → "l1" & return & "l2"', () => {
    expect(ec.appleContentExpr('l1\nl2')).toBe('"l1" & return & "l2"');
  });

  test('PowerShell: apostrof se zdvojí', () => {
    expect(ec.escPsSingle("a'b")).toBe("a''b");
  });

  test('PowerShell: zlomyslné tělo nerozbije single-quoted řetězec', () => {
    const ps = ec.buildOutlookPowershell({
      to: 'x@y.cz',
      subject: 'Věc',
      body: "'; Remove-Item C:\\ -Recurse; '"
    });
    expect(ps).toContain("$mail.Body = '''; Remove-Item C:\\ -Recurse; '''");
  });
});
