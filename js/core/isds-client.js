// --- ISDS klient (Datové schránky) ---
// Čisté (bezstavové) funkce pro sestavení a parsování SOAP zpráv webových služeb
// ISDS. Odděleno od main.js kvůli testovatelnosti (síťové volání dělá main.js).
//
// Zdroje (oficiální dokumentace ISDS webových služeb):
//   - Manipulace se zprávami (CreateMessage, GetDeliveryInfo, GetMessageStateChanges): služba /DS/dz a /DS/dx
//   - Vyhledávání schránek (FindDataBox): služba /DS/df
//   - SOAP 1.1, jmenný prostor http://isds.czechpoint.cz/v20
//   - Autentizace: HTTP Basic (jméno + heslo), volitelně klientský certifikát
//
// POZOR: Přesný host/cesta se u WS přístupu liší podle typu přihlášení a verze;
// proto jsou endpointy KONFIGUROVATELNÉ. Výchozí hodnoty odpovídají standardnímu
// přihlášení jménem a heslem; ověř je proti přístupovým údajům, které dostaneš
// k WS (a pro testy použij testovací prostředí czebox).

'use strict';

const ISDS_NS = 'http://isds.czechpoint.cz/v20';

// Výchozí endpointy. Host lze přepsat (např. při přístupu přes certifikát:
// ws1c.mojedatovaschranka.cz a cesta /cert/DS/...).
const ISDS_ENDPOINTS = {
    production: {
        host: 'https://ws1.mojedatovaschranka.cz',
        basePath: '/DS',
        // Přístup klientským certifikátem (login certificate: jméno+heslo+cert).
        certHost: 'https://ws1c.mojedatovaschranka.cz',
        certBasePath: '/cert/DS'
    },
    test: {
        // Testovací prostředí „czebox".
        host: 'https://ws1.czebox.cz',
        basePath: '/DS',
        certHost: 'https://ws1c.czebox.cz',
        certBasePath: '/cert/DS'
    }
};

// Mapování skupiny operací na service-cestu.
const SERVICE_PATHS = {
    messages: 'dz',   // CreateMessage, MessageDownload, GetDeliveryInfo...
    info: 'dx',       // GetMessageStateChanges, GetListOfSentMessages...
    search: 'df',     // FindDataBox, CheckDataBox, GetDataBoxActivityStatus
    manage: 'DsManage'// GetOwnerInfoFromLogin...
};

// Sestaví plnou URL služby pro dané prostředí a skupinu operací.
// useCert=true → cesta pro přístup klientským certifikátem (ws1c... /cert/DS).
function buildEndpoint(env, service, override, useCert) {
    const cfg = ISDS_ENDPOINTS[env === 'production' ? 'production' : 'test'];
    const host = (override && override.host) || (useCert ? cfg.certHost : cfg.host);
    const basePath = (override && override.basePath) || (useCert ? cfg.certBasePath : cfg.basePath);
    const svc = SERVICE_PATHS[service] || service;
    return `${host}${basePath}/${svc}`;
}

// Escapování textu do XML.
function escapeXml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Obalí tělo do SOAP 1.1 obálky s jmenným prostorem ISDS v20 (prefix p).
function soapEnvelope(innerXml) {
    return `<?xml version="1.0" encoding="utf-8"?>` +
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:p="${ISDS_NS}">` +
        `<soap:Body>${innerXml}</soap:Body></soap:Envelope>`;
}

// Vytáhne jednoduchou hodnotu elementu (bez ohledu na prefix). Vrací null, když chybí.
function pickTag(xml, tag) {
    if (!xml) return null;
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : null;
}

// Vytáhne všechny výskyty elementu (vrací pole vnitřních XML).
function pickAll(xml, tag) {
    if (!xml) return [];
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'ig');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
}

// Stav odpovědi ISDS (dmStatus / dbStatus): kód 0000 = OK.
function parseStatus(xml) {
    const code = pickTag(xml, 'dmStatusCode') || pickTag(xml, 'dbStatusCode');
    const message = pickTag(xml, 'dmStatusMessage') || pickTag(xml, 'dbStatusMessage');
    return { code, message, ok: code === '0000' };
}

// ---------- FindDataBox (ověření reálné schránky) ----------

// query = { dbID?, ic?, firmName?, dbType?, pnLastName?, pnGivenNames? }
function buildFindDataBoxRequest(query) {
    const q = query || {};
    const fields = [];
    if (q.dbID) fields.push(`<p:dbID>${escapeXml(q.dbID)}</p:dbID>`);
    if (q.dbType) fields.push(`<p:dbType>${escapeXml(q.dbType)}</p:dbType>`);
    if (q.ic) fields.push(`<p:ic>${escapeXml(q.ic)}</p:ic>`);
    if (q.firmName) fields.push(`<p:firmName>${escapeXml(q.firmName)}</p:firmName>`);
    if (q.pnLastName) fields.push(`<p:pnLastName>${escapeXml(q.pnLastName)}</p:pnLastName>`);
    if (q.pnGivenNames) fields.push(`<p:pnGivenNames>${escapeXml(q.pnGivenNames)}</p:pnGivenNames>`);
    return soapEnvelope(
        `<p:FindDataBox><p:dbOwnerInfo>${fields.join('')}</p:dbOwnerInfo></p:FindDataBox>`
    );
}

// Vrátí { status, boxes: [{ dbID, dbType, dbState, firmName, ic }] }.
// dbState: 1=aktivní, 2=dočasně nedostupná, 3=znepřístupněná, 5=zrušená.
function parseFindDataBoxResponse(xml) {
    const status = parseStatus(xml);
    const boxes = pickAll(xml, 'dbOwnerInfo').map(inner => ({
        dbID: pickTag(inner, 'dbID'),
        dbType: pickTag(inner, 'dbType'),
        dbState: pickTag(inner, 'dbState'),
        firmName: pickTag(inner, 'firmName'),
        ic: pickTag(inner, 'ic')
    })).filter(b => b.dbID);
    return { status, boxes };
}

// Ověří, že daná schránka existuje a je doručitelná (aktivní).
function isDeliverableState(dbState) {
    return dbState === '1' || dbState === 1;
}

// ---------- CreateMessage (odeslání datové zprávy) ----------

// msg = { dbIDRecipient, annotation, files: [{ name, mimeType, base64 }] }
function buildCreateMessageRequest(msg) {
    const m = msg || {};
    const files = Array.isArray(m.files) ? m.files : [];
    const filesXml = files.map((f, i) => {
        const meta = i === 0 ? 'main' : 'enclosure';
        return `<p:dmFile dmMimeType="${escapeXml(f.mimeType || 'application/octet-stream')}" ` +
            `dmFileMetaType="${meta}" dmFileDescr="${escapeXml(f.name || `priloha_${i + 1}`)}">` +
            `<p:dmEncodedContent>${(f.base64 || '').replace(/\s+/g, '')}</p:dmEncodedContent>` +
            `</p:dmFile>`;
    }).join('');
    return soapEnvelope(
        `<p:CreateMessage>` +
        `<p:dmEnvelope>` +
        `<p:dbIDRecipient>${escapeXml(m.dbIDRecipient)}</p:dbIDRecipient>` +
        `<p:dmAnnotation>${escapeXml(m.annotation || 'Bez předmětu')}</p:dmAnnotation>` +
        `</p:dmEnvelope>` +
        `<p:dmFiles>${filesXml}</p:dmFiles>` +
        `</p:CreateMessage>`
    );
}

// Vrátí { status, dmID }.
function parseCreateMessageResponse(xml) {
    const status = parseStatus(xml);
    const dmID = pickTag(xml, 'dmID');
    return { status, dmID };
}

// ---------- GetDeliveryInfo (doručenka / stav) ----------

function buildGetDeliveryInfoRequest(dmID) {
    return soapEnvelope(`<p:GetDeliveryInfo><p:dmID>${escapeXml(dmID)}</p:dmID></p:GetDeliveryInfo>`);
}

// Vrátí { status, dmID, events: [{ time, descr }] }.
function parseGetDeliveryInfoResponse(xml) {
    const status = parseStatus(xml);
    const events = pickAll(xml, 'dmEvent').map(inner => ({
        time: pickTag(inner, 'dmEventTime'),
        descr: pickTag(inner, 'dmEventDescr')
    }));
    return { status, dmID: pickTag(xml, 'dmID'), events };
}

// ---------- Stav zprávy: číselník ----------

// Mapování dmMessageStatus na čitelný stav. Právně podstatné: 3=dodána (jen
// v schránce), 4=doručena přihlášením, 5=doručena fikcí (po 10 dnech).
const MESSAGE_STATUS = {
    1: 'Podána',
    2: 'Prošla antivirovou kontrolou',
    3: 'Dodána do schránky',
    4: 'Doručena přihlášením',
    5: 'Doručena fikcí',
    6: 'Přečtena',
    7: 'Nedoručitelná',
    8: 'Smazána',
    9: 'V datovém trezoru',
    10: 'Obsah smazán'
};
function messageStatusLabel(code) {
    const n = parseInt(code, 10);
    return MESSAGE_STATUS[n] || `Stav ${code}`;
}
// Je zpráva právně doručena? (přihlášením nebo fikcí)
function isDelivered(code) {
    const n = parseInt(code, 10);
    return n === 4 || n === 5;
}

// ---------- GetMessageStateChanges (hromadné stavy více zpráv) ----------
// Vrátí jen zprávy, kterým se od zadaného času změnil stav — efektivní pro objem
// (místo dotazu na každou zprávu zvlášť). Čas ve formátu ISO.
function buildGetMessageStateChangesRequest(fromTime, toTime) {
    const parts = [];
    if (fromTime) parts.push(`<p:dmFromTime>${escapeXml(fromTime)}</p:dmFromTime>`);
    if (toTime) parts.push(`<p:dmToTime>${escapeXml(toTime)}</p:dmToTime>`);
    return soapEnvelope(`<p:GetMessageStateChanges>${parts.join('')}</p:GetMessageStateChanges>`);
}

// Vrátí { status, changes: [{ dmID, status, statusLabel, delivered, time }] }.
function parseGetMessageStateChangesResponse(xml) {
    const status = parseStatus(xml);
    // Struktura záznamu se může u živé odpovědi lišit — parser je tolerantní.
    let records = pickAll(xml, 'dmStatusChangesRecord');
    if (records.length === 0) records = pickAll(xml, 'dmRecord');
    const changes = records.map(inner => {
        const st = pickTag(inner, 'dmMessageStatus');
        return {
            dmID: pickTag(inner, 'dmID'),
            status: st,
            statusLabel: messageStatusLabel(st),
            delivered: isDelivered(st),
            time: pickTag(inner, 'dmStateChanged') || pickTag(inner, 'dmEventTime')
        };
    }).filter(r => r.dmID);
    return { status, changes };
}

// ---------- GetSignedDeliveryInfo (podepsaná doručenka — právní doklad) ----------
function buildGetSignedDeliveryInfoRequest(dmID) {
    return soapEnvelope(`<p:GetSignedDeliveryInfo><p:dmID>${escapeXml(dmID)}</p:dmID></p:GetSignedDeliveryInfo>`);
}

// Vrátí { status, dmID, signedData (base64 CMS — archivovat jako doklad), events }.
// Podepsaná data (dmSignature) jsou průkazná doručenka; ověření CMS podpisu je
// samostatný krok. Události parsujeme best-effort z obsahu.
function parseGetSignedDeliveryInfoResponse(xml) {
    const status = parseStatus(xml);
    const signedData = pickTag(xml, 'dmSignature') || pickTag(xml, 'dmSignedDeliveryInfo');
    const events = pickAll(xml, 'dmEvent').map(inner => ({
        time: pickTag(inner, 'dmEventTime'),
        descr: pickTag(inner, 'dmEventDescr')
    }));
    return { status, dmID: pickTag(xml, 'dmID'), signedData: signedData ? signedData.replace(/\s+/g, '') : null, events };
}

// ---------- Příchozí zprávy ----------
// POZOR na fikci doručení: výpis a stažení OBÁLKY doručení NEspouští. Stažení
// OBSAHU (MessageDownload) se považuje za doručení přihlášením oprávněné osoby.

// GetListOfReceivedMessages — seznam přijatých obálek (bez spuštění doručení).
function buildGetListOfReceivedMessagesRequest(fromTime, toTime, opts) {
    const o = opts || {};
    const parts = [];
    if (fromTime) parts.push(`<p:dmFromTime>${escapeXml(fromTime)}</p:dmFromTime>`);
    if (toTime) parts.push(`<p:dmToTime>${escapeXml(toTime)}</p:dmToTime>`);
    parts.push(`<p:dmStatusFilter>${escapeXml(o.statusFilter != null ? o.statusFilter : -1)}</p:dmStatusFilter>`);
    parts.push(`<p:dmOffset>${escapeXml(o.offset != null ? o.offset : 1)}</p:dmOffset>`);
    parts.push(`<p:dmLimit>${escapeXml(o.limit != null ? o.limit : 1000)}</p:dmLimit>`);
    return soapEnvelope(`<p:GetListOfReceivedMessages>${parts.join('')}</p:GetListOfReceivedMessages>`);
}

// Parsuje seznam zpráv (přijatých i odeslaných) na obálky.
function parseMessageListResponse(xml) {
    const status = parseStatus(xml);
    const messages = pickAll(xml, 'dmRecord').map(inner => {
        const st = pickTag(inner, 'dmMessageStatus');
        return {
            dmID: pickTag(inner, 'dmID'),
            annotation: pickTag(inner, 'dmAnnotation'),
            sender: pickTag(inner, 'dmSender'),
            senderId: pickTag(inner, 'dbIDSender'),
            recipient: pickTag(inner, 'dmRecipient'),
            recipientId: pickTag(inner, 'dbIDRecipient'),
            deliveryTime: pickTag(inner, 'dmDeliveryTime'),
            acceptanceTime: pickTag(inner, 'dmAcceptanceTime'),
            status: st,
            statusLabel: messageStatusLabel(st),
            delivered: isDelivered(st)
        };
    }).filter(m => m.dmID);
    return { status, messages };
}

// MessageEnvelopeDownload — jen obálka (NEspouští doručení).
function buildMessageEnvelopeDownloadRequest(dmID) {
    return soapEnvelope(`<p:MessageEnvelopeDownload><p:dmID>${escapeXml(dmID)}</p:dmID></p:MessageEnvelopeDownload>`);
}

// MessageDownload — plné stažení OBSAHU. POZOR: spouští doručení přihlášením.
function buildMessageDownloadRequest(dmID) {
    return soapEnvelope(`<p:MessageDownload><p:dmID>${escapeXml(dmID)}</p:dmID></p:MessageDownload>`);
}

// Parsuje staženou zprávu: obálka + přílohy (base64).
function parseMessageDownloadResponse(xml) {
    const status = parseStatus(xml);
    const envelope = {
        dmID: pickTag(xml, 'dmID'),
        annotation: pickTag(xml, 'dmAnnotation'),
        sender: pickTag(xml, 'dmSender'),
        senderId: pickTag(xml, 'dbIDSender'),
        deliveryTime: pickTag(xml, 'dmDeliveryTime'),
        acceptanceTime: pickTag(xml, 'dmAcceptanceTime')
    };
    // dmFileDescr a dmMimeType jsou ATRIBUTY tagu <dmFile>, obsah je v <dmEncodedContent>.
    const files = [];
    const fileRe = /<(?:[\w-]+:)?dmFile\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?dmFile>/ig;
    let fm;
    while ((fm = fileRe.exec(xml)) !== null) {
        const attrs = fm[1] || '';
        const inner = fm[2] || '';
        const descr = (attrs.match(/dmFileDescr="([^"]*)"/) || [])[1];
        const mime = (attrs.match(/dmMimeType="([^"]*)"/) || [])[1] || 'application/octet-stream';
        const b64 = (pickTag(inner, 'dmEncodedContent') || '').replace(/\s+/g, '');
        if (descr || b64) files.push({ name: descr || 'priloha', mimeType: mime, base64: b64 });
    }
    return { status, envelope, files };
}

// MarkMessageAsDownloaded — potvrdí stažení zprávy.
function buildMarkMessageAsDownloadedRequest(dmID) {
    return soapEnvelope(`<p:MarkMessageAsDownloaded><p:dmID>${escapeXml(dmID)}</p:dmID></p:MarkMessageAsDownloaded>`);
}

// ---------- GetOwnerInfoFromLogin (test přihlášení) ----------

function buildGetOwnerInfoRequest() {
    return soapEnvelope(`<p:GetOwnerInfoFromLogin/>`);
}

function parseGetOwnerInfoResponse(xml) {
    const status = parseStatus(xml);
    return {
        status,
        dbID: pickTag(xml, 'dbID'),
        firmName: pickTag(xml, 'firmName')
    };
}

// SOAPAction hlavička podle operace (některé WS ji vyžadují).
function soapAction(operation) {
    return `"${ISDS_NS}/${operation}"`;
}

module.exports = {
    ISDS_NS,
    ISDS_ENDPOINTS,
    SERVICE_PATHS,
    buildEndpoint,
    escapeXml,
    soapEnvelope,
    soapAction,
    parseStatus,
    buildFindDataBoxRequest,
    parseFindDataBoxResponse,
    isDeliverableState,
    buildCreateMessageRequest,
    parseCreateMessageResponse,
    buildGetDeliveryInfoRequest,
    parseGetDeliveryInfoResponse,
    buildGetOwnerInfoRequest,
    parseGetOwnerInfoResponse,
    MESSAGE_STATUS,
    messageStatusLabel,
    isDelivered,
    buildGetMessageStateChangesRequest,
    parseGetMessageStateChangesResponse,
    buildGetSignedDeliveryInfoRequest,
    parseGetSignedDeliveryInfoResponse,
    buildGetListOfReceivedMessagesRequest,
    parseMessageListResponse,
    buildMessageEnvelopeDownloadRequest,
    buildMessageDownloadRequest,
    parseMessageDownloadResponse,
    buildMarkMessageAsDownloadedRequest
};
