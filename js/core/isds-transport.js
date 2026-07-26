// --- isds-transport — čistá rozhodovací logika pro ISDS požadavek (bez HTTP/IO) ---
// Vytaženo z main.js (isdsCall) kvůli testovatelnosti. Rozhoduje o:
//   • prostředí (test vs. produkce),
//   • Basic auth hlavičce (jméno+heslo),
//   • použití klientského certifikátu (mTLS),
//   • TLS volbách (.p12/pfx vs. cert+key PEM),
//   • endpointu (přes isdsClient.buildEndpoint) a SOAPAction.
// Samotné čtení certifikátu ze souboru a HTTP zůstávají v main.js (I/O).

'use strict';

function resolveEnv(creds) {
    return (creds && creds.env === 'production') ? 'production' : 'test';
}

// Basic auth z login+hesla. Bez loginu vrací null (hlavička se nepřidá).
function basicAuthHeader(login, pass) {
    if (!login) return null;
    return 'Basic ' + Buffer.from(String(login) + ':' + String(pass == null ? '' : pass)).toString('base64');
}

// mTLS použijeme, když máme .p12/pfx buffer NEBO dvojici cert+key v PEM.
function shouldUseCert(creds, certPfx) {
    return !!(certPfx || (creds && creds.certPem && creds.keyPem));
}

// TLS volby pro https požadavek s klientským certifikátem, nebo null když se necertifikuje.
function tlsOptions(creds, certPfx) {
    if (!shouldUseCert(creds, certPfx)) return null;
    const pass = (creds && creds.certPass) || undefined;
    return certPfx
        ? { pfx: certPfx, passphrase: pass }
        : { cert: creds.certPem, key: creds.keyPem, passphrase: pass };
}

// Override endpointu z formuláře (host/basePath), jinak null (výchozí dle prostředí).
function endpointOverride(creds) {
    return (creds && (creds.host || creds.basePath)) ? { host: creds.host, basePath: creds.basePath } : null;
}

// Sestaví vše potřebné kromě I/O: { env, useCert, url, headers, tls, override }.
// isdsClient (buildEndpoint, soapAction) se předává v opts (v prohlížeči fallback na window).
function buildRequest(creds, service, operation, opts) {
    opts = opts || {};
    const isdsClient = opts.isdsClient || (typeof window !== 'undefined' ? window.LexisIsdsClient : null);
    const certPfx = opts.certPfx || (creds && creds.certPfx) || null;
    const env = resolveEnv(creds);
    const useCert = shouldUseCert(creds, certPfx);
    const override = endpointOverride(creds);
    const url = isdsClient && isdsClient.buildEndpoint ? isdsClient.buildEndpoint(env, service, override, useCert) : null;
    const headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': (isdsClient && isdsClient.soapAction) ? isdsClient.soapAction(operation) : operation
    };
    const auth = basicAuthHeader(creds && creds.login, creds && creds.pass);
    if (auth) headers['Authorization'] = auth;
    return { env: env, useCert: useCert, url: url, headers: headers, tls: tlsOptions(creds, certPfx), override: override };
}

module.exports = { resolveEnv, basicAuthHeader, shouldUseCert, tlsOptions, endpointOverride, buildRequest };
if (typeof window !== 'undefined') window.LexisIsdsTransport = module.exports;
