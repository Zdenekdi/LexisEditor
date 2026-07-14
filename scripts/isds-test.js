#!/usr/bin/env node
'use strict';
/**
 * ISDS smoke test — ověří napojení na webové služby datových schránek
 * BEZ spuštění celé aplikace. Používá modul js/core/isds-client.js.
 *
 * Použití (doporučeno nejdřív testovací prostředí czebox):
 *
 *   ISDS_LOGIN=... ISDS_PASSWORD=... ISDS_ENV=test \
 *   node scripts/isds-test.js
 *
 * Volitelně (ověření konkrétní schránky a odeslání sám sobě):
 *   ISDS_FIND_IC=12345678            # vyhledá schránku dle IČO
 *   ISDS_SEND_TO=xxxxxxx             # odešle testovací zprávu do této schránky
 *
 * Proměnné:
 *   ISDS_ENV       test | production   (výchozí test)
 *   ISDS_LOGIN     přihlašovací jméno k WS
 *   ISDS_PASSWORD  heslo
 *   ISDS_HOST      volitelně přepis hostitele (např. https://ws1c.mojedatovaschranka.cz)
 *   ISDS_BASEPATH  volitelně přepis cesty (např. /cert/DS)
 *
 * POZNÁMKA: Vyžaduje platný přístup k webovým službám ISDS (ne jen přihlášení do
 * webového rozhraní). Pro produkci může být odeslání komerční zprávy zpoplatněno —
 * testuj primárně na czebox.
 */

const isds = require('../js/core/isds-client.js');

const creds = {
    login: process.env.ISDS_LOGIN,
    pass: process.env.ISDS_PASSWORD,
    env: process.env.ISDS_ENV === 'production' ? 'production' : 'test',
    host: process.env.ISDS_HOST || undefined,
    basePath: process.env.ISDS_BASEPATH || undefined
};

function endpoint(service) {
    const override = (creds.host || creds.basePath) ? { host: creds.host, basePath: creds.basePath } : null;
    return isds.buildEndpoint(creds.env, service, override);
}

async function call(service, operation, body) {
    const url = endpoint(service);
    const auth = Buffer.from(`${creds.login}:${creds.pass}`).toString('base64');
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': isds.soapAction(operation),
            'Authorization': `Basic ${auth}`
        },
        body
    });
    const text = await res.text();
    return { httpStatus: res.status, text, url };
}

async function main() {
    if (!creds.login || !creds.pass) {
        console.error('❌ Nastav ISDS_LOGIN a ISDS_PASSWORD (a případně ISDS_ENV=test).');
        process.exit(1);
    }
    console.log(`▶ Prostředí: ${creds.env}   Endpoint (manage): ${endpoint('manage')}`);

    // 1) Test přihlášení
    console.log('\n[1] GetOwnerInfoFromLogin (test přihlášení)...');
    try {
        const r = await call('manage', 'GetOwnerInfoFromLogin', isds.buildGetOwnerInfoRequest());
        const p = isds.parseGetOwnerInfoResponse(r.text);
        if (p.dbID) console.log(`    ✅ Přihlášeno. Schránka: ${p.dbID}${p.firmName ? ' (' + p.firmName + ')' : ''}`);
        else console.log(`    ❌ Nepřihlášeno (HTTP ${r.httpStatus}): ${p.status.message || 'neznámá chyba'}`);
    } catch (e) { console.log('    ❌ Chyba:', e.message); }

    // 2) FindDataBox (volitelné, dle IČO)
    if (process.env.ISDS_FIND_IC) {
        console.log(`\n[2] FindDataBox (IČO ${process.env.ISDS_FIND_IC})...`);
        try {
            const r = await call('search', 'FindDataBox', isds.buildFindDataBoxRequest({ ic: process.env.ISDS_FIND_IC }));
            const p = isds.parseFindDataBoxResponse(r.text);
            if (p.boxes.length) {
                p.boxes.forEach(b => console.log(`    ✅ ${b.dbID} · typ ${b.dbType} · stav ${b.dbState} · ${isds.isDeliverableState(b.dbState) ? 'DORUČITELNÁ' : 'nedoručitelná'} · ${b.firmName || ''}`));
            } else {
                console.log(`    ⚠️ Nenalezeno (HTTP ${r.httpStatus}): ${p.status.message || ''}`);
            }
        } catch (e) { console.log('    ❌ Chyba:', e.message); }
    }

    // 3) Odeslání testovací zprávy (volitelné) + doručenka
    if (process.env.ISDS_SEND_TO) {
        console.log(`\n[3] CreateMessage → ${process.env.ISDS_SEND_TO}...`);
        try {
            const body = isds.buildCreateMessageRequest({
                dbIDRecipient: process.env.ISDS_SEND_TO,
                annotation: 'LexisEditor – testovací zpráva',
                files: [{ name: 'test.txt', mimeType: 'text/plain', base64: Buffer.from('Testovací obsah LexisEditor.').toString('base64') }]
            });
            const r = await call('messages', 'CreateMessage', body);
            const p = isds.parseCreateMessageResponse(r.text);
            if (p.status.ok && p.dmID) {
                console.log(`    ✅ Odesláno. dmID = ${p.dmID}`);
                console.log('\n[4] GetDeliveryInfo (doručenka)...');
                const dr = await call('info', 'GetDeliveryInfo', isds.buildGetDeliveryInfoRequest(p.dmID));
                const dp = isds.parseGetDeliveryInfoResponse(dr.text);
                if (dp.status.ok) {
                    console.log(`    ✅ Stav zprávy ${dp.dmID}: ${dp.events.length} událostí`);
                    dp.events.forEach(ev => console.log(`       · ${ev.time || ''} ${ev.descr || ''}`));
                } else {
                    console.log(`    ⚠️ Doručenku nelze získat: ${dp.status.message || ''}`);
                }
            } else {
                console.log(`    ❌ Odeslání selhalo (HTTP ${r.httpStatus}): ${p.status.message || ''}`);
            }
        } catch (e) { console.log('    ❌ Chyba:', e.message); }
    }

    console.log('\nHotovo.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
