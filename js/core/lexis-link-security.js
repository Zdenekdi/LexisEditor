// --- LexisLink Security Helpers ---
// Čisté (bezstavové) funkce pro autorizaci LexisLink serveru.
// Odděleno od main.js kvůli testovatelnosti (main.js je svázaný s Electronem).

const crypto = require('crypto');

// Porovnání dvou řetězců v konstantním čase (obrana proti timing útoku).
function timingSafeEqualStr(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    try {
        return crypto.timingSafeEqual(ba, bb);
    } catch (e) {
        return false;
    }
}

// Vytáhne token z hlavičky "Authorization: Bearer <token>" nebo z query "?token=".
function extractToken(req, parsedUrl) {
    const auth = req && req.headers ? req.headers['authorization'] : null;
    if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
        return auth.slice(7).trim();
    }
    if (parsedUrl && parsedUrl.searchParams) {
        const q = parsedUrl.searchParams.get('token');
        if (q) return q;
    }
    return null;
}

// Ověří, že požadavek nese platný párovací token.
function isValidToken(req, parsedUrl, expectedToken) {
    if (!expectedToken) return false;
    const provided = extractToken(req, parsedUrl);
    if (!provided) return false;
    return timingSafeEqualStr(provided, expectedToken);
}

// Seznam originů, které smí server obsluhovat přes CORS (jen vlastní stránka).
function getKnownOrigins(port, ip) {
    const origins = ['http://localhost:' + port, 'http://127.0.0.1:' + port];
    if (ip && ip !== 'localhost') origins.push('http://' + ip + ':' + port);
    return origins;
}

// Je daný origin mezi známými (povolenými) originy?
function isKnownOrigin(origin, port, ip) {
    if (!origin) return false;
    return getKnownOrigins(port, ip).includes(origin);
}

// Generuje silný náhodný párovací token.
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    timingSafeEqualStr,
    extractToken,
    isValidToken,
    getKnownOrigins,
    isKnownOrigin,
    generateToken
};
