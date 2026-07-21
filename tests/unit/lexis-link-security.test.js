// Unit testy pro bezpečnostní vrstvu LexisLink serveru (párovací token + CORS).
const security = require('../../js/core/lexis-link-security.js');

// Pomocník: falešný HTTP request s hlavičkami.
function mockReq(headers = {}) {
    return { headers };
}
// Pomocník: parsedUrl s query parametry (jako new URL(...)).
function mockUrl(query = {}) {
    const searchParams = new URLSearchParams(query);
    return { searchParams };
}

describe('LexisLink security helpers', () => {

    describe('timingSafeEqualStr', () => {
        test('shodné řetězce => true', () => {
            expect(security.timingSafeEqualStr('abc123', 'abc123')).toBe(true);
        });
        test('odlišné řetězce => false', () => {
            expect(security.timingSafeEqualStr('abc123', 'abc124')).toBe(false);
        });
        test('různá délka => false', () => {
            expect(security.timingSafeEqualStr('abc', 'abcd')).toBe(false);
        });
        test('ne-řetězec => false', () => {
            expect(security.timingSafeEqualStr(null, 'abc')).toBe(false);
            expect(security.timingSafeEqualStr('abc', undefined)).toBe(false);
        });
    });

    describe('extractToken', () => {
        test('z hlavičky Authorization: Bearer', () => {
            const req = mockReq({ authorization: 'Bearer tok_header' });
            expect(security.extractToken(req, mockUrl())).toBe('tok_header');
        });
        test('z query ?token=', () => {
            const req = mockReq({});
            expect(security.extractToken(req, mockUrl({ token: 'tok_query' }))).toBe('tok_query');
        });
        test('hlavička má přednost před query', () => {
            const req = mockReq({ authorization: 'Bearer tok_header' });
            expect(security.extractToken(req, mockUrl({ token: 'tok_query' }))).toBe('tok_header');
        });
        test('bez tokenu => null', () => {
            expect(security.extractToken(mockReq({}), mockUrl())).toBeNull();
        });
    });

    describe('isValidToken', () => {
        const expected = 'spravny_token_123';
        test('platný token v hlavičce => true', () => {
            const req = mockReq({ authorization: 'Bearer ' + expected });
            expect(security.isValidToken(req, mockUrl(), expected)).toBe(true);
        });
        test('platný token v query => true', () => {
            const req = mockReq({});
            expect(security.isValidToken(req, mockUrl({ token: expected }), expected)).toBe(true);
        });
        test('neplatný token => false', () => {
            const req = mockReq({ authorization: 'Bearer spatny' });
            expect(security.isValidToken(req, mockUrl(), expected)).toBe(false);
        });
        test('chybějící token na požadavku => false', () => {
            expect(security.isValidToken(mockReq({}), mockUrl(), expected)).toBe(false);
        });
        test('server bez nastaveného tokenu => false', () => {
            const req = mockReq({ authorization: 'Bearer cokoliv' });
            expect(security.isValidToken(req, mockUrl(), null)).toBe(false);
        });
    });

    describe('isKnownOrigin / getKnownOrigins', () => {
        const PORT = 3300;
        const IP = '192.168.1.50';
        test('localhost i 127.0.0.1 jsou známé', () => {
            expect(security.isKnownOrigin('http://localhost:3300', PORT, IP)).toBe(true);
            expect(security.isKnownOrigin('http://127.0.0.1:3300', PORT, IP)).toBe(true);
        });
        test('LAN IP serveru je známá', () => {
            expect(security.isKnownOrigin('http://192.168.1.50:3300', PORT, IP)).toBe(true);
        });
        test('cizí origin => false', () => {
            expect(security.isKnownOrigin('http://evil.example.com', PORT, IP)).toBe(false);
            expect(security.isKnownOrigin('http://192.168.1.99:3300', PORT, IP)).toBe(false);
        });
        test('prázdný origin => false', () => {
            expect(security.isKnownOrigin('', PORT, IP)).toBe(false);
            expect(security.isKnownOrigin(undefined, PORT, IP)).toBe(false);
        });
    });

    describe('generateToken', () => {
        test('vrací 64 hex znaků (32 bajtů)', () => {
            const t = security.generateToken();
            expect(t).toMatch(/^[0-9a-f]{64}$/);
        });
        test('dva tokeny se liší', () => {
            expect(security.generateToken()).not.toBe(security.generateToken());
        });
    });
});
