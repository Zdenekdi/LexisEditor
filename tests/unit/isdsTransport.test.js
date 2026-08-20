/**
 * Testy čisté logiky ISDS požadavku (js/core/isds-transport.js) — prostředí,
 * Basic auth, rozhodnutí o certifikátu (mTLS), TLS volby a sestavení hlaviček/URL.
 * main.js (isdsCall) na tuhle logiku deleguje; I/O a HTTP zůstávají mimo.
 */
const T = require('../../js/core/isds-transport');

// Falešný isdsClient — ať test nezávisí na skutečných endpointech.
const fakeClient = {
    buildEndpoint: (env, service, override, useCert) =>
        `https://ws1.${env === 'production' ? 'mojedatovaschranka' : 'czebox'}.cz/${useCert ? 'cert/' : ''}${service}${override ? '?ovr=1' : ''}`,
    soapAction: (op) => `ISDS:${op}`
};

describe('resolveEnv', () => {
    test('production jen při env==="production", jinak test', () => {
        expect(T.resolveEnv({ env: 'production' })).toBe('production');
        expect(T.resolveEnv({ env: 'test' })).toBe('test');
        expect(T.resolveEnv({})).toBe('test');
        expect(T.resolveEnv(null)).toBe('test');
    });
});

describe('basicAuthHeader', () => {
    test('sestaví Basic z login:pass', () => {
        expect(T.basicAuthHeader('novak', 'tajne'))
            .toBe('Basic ' + Buffer.from('novak:tajne').toString('base64'));
    });
    test('prázdné heslo je povolené', () => {
        expect(T.basicAuthHeader('novak', '')).toBe('Basic ' + Buffer.from('novak:').toString('base64'));
        expect(T.basicAuthHeader('novak', null)).toBe('Basic ' + Buffer.from('novak:').toString('base64'));
    });
    test('bez loginu → null (hlavička se nepřidá)', () => {
        expect(T.basicAuthHeader('', 'x')).toBeNull();
        expect(T.basicAuthHeader(undefined, 'x')).toBeNull();
    });
});

describe('shouldUseCert / tlsOptions', () => {
    test('cert z pfx bufferu', () => {
        const pfx = Buffer.from('p12');
        expect(T.shouldUseCert({}, pfx)).toBe(true);
        expect(T.tlsOptions({ certPass: 'pin' }, pfx)).toEqual({ pfx, passphrase: 'pin' });
    });
    test('cert z PEM dvojice', () => {
        const creds = { certPem: 'C', keyPem: 'K', certPass: 'p' };
        expect(T.shouldUseCert(creds, null)).toBe(true);
        expect(T.tlsOptions(creds, null)).toEqual({ cert: 'C', key: 'K', passphrase: 'p' });
    });
    test('jen cert bez key → necertifikuje se', () => {
        expect(T.shouldUseCert({ certPem: 'C' }, null)).toBe(false);
        expect(T.tlsOptions({ certPem: 'C' }, null)).toBeNull();
    });
    test('bez certu → null', () => {
        expect(T.shouldUseCert({}, null)).toBe(false);
        expect(T.tlsOptions({}, null)).toBeNull();
    });
});

describe('endpointOverride', () => {
    test('host nebo basePath → override, jinak null', () => {
        expect(T.endpointOverride({ host: 'ws1.mojedatovaschranka.cz' })).toEqual({ host: 'ws1.mojedatovaschranka.cz', basePath: undefined });
        expect(T.endpointOverride({ basePath: '/b' })).toEqual({ host: undefined, basePath: '/b' });
        expect(T.endpointOverride({})).toBeNull();
        // bezpečnostní allowlist: nepovolený host → null (neodesílat na cizí endpoint)
        expect(T.endpointOverride({ host: 'evil.example.com' })).toBeNull();
    });
});

describe('buildRequest (celková orchestrace)', () => {
    test('heslo+bez certu: test endpoint, Basic auth, žádné TLS', () => {
        const r = T.buildRequest({ login: 'a', pass: 'b', env: 'test' }, 'info', 'GetOwnerInfoFromLogin', { isdsClient: fakeClient });
        expect(r.env).toBe('test');
        expect(r.useCert).toBe(false);
        expect(r.tls).toBeNull();
        expect(r.url).toContain('czebox.cz');
        expect(r.headers['SOAPAction']).toBe('ISDS:GetOwnerInfoFromLogin');
        expect(r.headers['Content-Type']).toContain('text/xml');
        expect(r.headers['Authorization']).toBe('Basic ' + Buffer.from('a:b').toString('base64'));
    });
    test('produkce + pfx cert: cert endpoint + TLS + auth', () => {
        const pfx = Buffer.from('p12');
        const r = T.buildRequest({ login: 'a', pass: 'b', env: 'production', certPass: 'pin' }, 'messages', 'MessageDownload', { isdsClient: fakeClient, certPfx: pfx });
        expect(r.env).toBe('production');
        expect(r.useCert).toBe(true);
        expect(r.url).toContain('mojedatovaschranka.cz');
        expect(r.url).toContain('/cert/');
        expect(r.tls).toEqual({ pfx, passphrase: 'pin' });
    });
    test('bez loginu → bez Authorization hlavičky', () => {
        const r = T.buildRequest({ env: 'test' }, 'search', 'FindDataBox', { isdsClient: fakeClient });
        expect(r.headers['Authorization']).toBeUndefined();
    });
});
