/**
 * Testy generátorů skriptů pro „nové okno pošty s přílohou"
 * (js/core/email-compose-script.js) — hlavně bezpečné escapování vstupů do
 * AppleScriptu (Apple Mail) a PowerShellu (Outlook), aby uvozovky/apostrofy
 * v předmětu, těle nebo cestě nerozbily skript.
 */

const C = require('../../js/core/email-compose-script');

describe('AppleScript (Apple Mail)', () => {
    test('escapuje uvozovky a zpětná lomítka', () => {
        expect(C.escAppleScript('a "b" \\c')).toBe('a \\"b\\" \\\\c');
    });

    test('víceřádkové tělo → spojení přes & return &', () => {
        expect(C.appleContentExpr('řádek 1\nřádek 2')).toBe('"řádek 1" & return & "řádek 2"');
    });

    test('skript obsahuje příjemce, předmět i přílohu', () => {
        const s = C.buildAppleMailScript({
            to: 'klient@x.cz', subject: 'Předvolání', body: 'Dobrý den',
            attachmentPaths: ['/Users/x/predvolani.pdf']
        });
        expect(s).toContain('tell application "Mail"');
        expect(s).toContain('address:"klient@x.cz"');
        expect(s).toContain('subject:"Předvolání"');
        expect(s).toContain('POSIX file "/Users/x/predvolani.pdf"');
        expect(s).toContain('visible:true'); // okno se ukáže, neodesílá
    });

    test('bez přílohy negeneruje attachment blok', () => {
        const s = C.buildAppleMailScript({ to: 'a@b.cz', subject: 'X', body: 'Y', attachmentPaths: [] });
        expect(s).not.toContain('make new attachment');
    });

    test('uvozovka v předmětu skript nerozbije (je zescapovaná)', () => {
        const s = C.buildAppleMailScript({ to: 'a@b.cz', subject: 'Věc "urgent"', body: '', attachmentPaths: [] });
        expect(s).toContain('subject:"Věc \\"urgent\\""');
    });
});

describe('PowerShell (Outlook)', () => {
    test('escapuje apostrof zdvojením', () => {
        expect(C.escPsSingle("O'Brien")).toBe("O''Brien");
    });

    test('skript nastaví To/Subject/Body, přílohu a zobrazí okno', () => {
        const s = C.buildOutlookPowershell({
            to: 'klient@x.cz', subject: 'Předvolání', body: 'Dobrý den',
            attachmentPaths: ['C:\\spisy\\predvolani.pdf']
        });
        expect(s).toContain("$mail.To = 'klient@x.cz'");
        expect(s).toContain("$mail.Subject = 'Předvolání'");
        expect(s).toContain("$mail.Attachments.Add('C:\\spisy\\predvolani.pdf')");
        expect(s).toContain('$mail.Display($false)'); // zobrazí, neodesílá
    });

    test('apostrof v cestě/těle nerozbije skript', () => {
        const s = C.buildOutlookPowershell({ to: 'a@b.cz', subject: '', body: "kancelář O'Brien", attachmentPaths: [] });
        expect(s).toContain("$mail.Body = 'kancelář O''Brien'");
    });
});
