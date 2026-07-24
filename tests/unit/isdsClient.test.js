/**
 * Testy ISDS klienta (js/core/isds-client.js) — sestavení a parsování SOAP zpráv
 * datových schránek. Právně kritické: doručitelnost schránky, stavy zprávy
 * (fikce doručení = 5), parsování příloh. Dnes bez testů.
 */

const I = require('../../js/core/isds-client');

describe('buildEndpoint', () => {
    test('produkce vs test, mapování služby', () => {
        expect(I.buildEndpoint('production', 'search')).toBe('https://ws1.mojedatovaschranka.cz/DS/df');
        expect(I.buildEndpoint('test', 'messages')).toBe('https://ws1.czebox.cz/DS/dz');
        expect(I.buildEndpoint('test', 'manage')).toBe('https://ws1.czebox.cz/DS/DsManage');
    });
    test('neznámé prostředí spadne na test', () => {
        expect(I.buildEndpoint('xyz', 'search')).toContain('czebox.cz');
    });
    test('přístup certifikátem → ws1c / cert cesta', () => {
        expect(I.buildEndpoint('production', 'search', null, true)).toBe('https://ws1c.mojedatovaschranka.cz/cert/DS/df');
    });
    test('override hosta/cesty má přednost', () => {
        expect(I.buildEndpoint('production', 'search', { host: 'https://x.cz', basePath: '/Y' })).toBe('https://x.cz/Y/df');
    });
});

describe('escapeXml + soapEnvelope', () => {
    test('escapuje speciální znaky', () => {
        expect(I.escapeXml('a & b < c > "d" \'e\'')).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;');
    });
    test('obálka má SOAP namespace a body', () => {
        const e = I.soapEnvelope('<p:X/>');
        expect(e).toContain('soap:Envelope');
        expect(e).toContain('xmlns:p="http://isds.czechpoint.cz/v20"');
        expect(e).toContain('<soap:Body><p:X/></soap:Body>');
    });
    test('soapAction', () => {
        expect(I.soapAction('CreateMessage')).toBe('"http://isds.czechpoint.cz/v20/CreateMessage"');
    });
});

describe('parseStatus', () => {
    test('0000 = ok', () => {
        const s = I.parseStatus('<dmStatus><dmStatusCode>0000</dmStatusCode><dmStatusMessage>OK</dmStatusMessage></dmStatus>');
        expect(s).toEqual({ code: '0000', message: 'OK', ok: true });
    });
    test('jiný kód = not ok (i dbStatus varianta)', () => {
        const s = I.parseStatus('<dbStatusCode>1004</dbStatusCode><dbStatusMessage>chyba</dbStatusMessage>');
        expect(s.ok).toBe(false);
        expect(s.code).toBe('1004');
    });
});

describe('FindDataBox', () => {
    test('request obsahuje jen zadaná pole a escapuje', () => {
        const r = I.buildFindDataBoxRequest({ ic: '27232433', firmName: 'ČEZ & spol' });
        expect(r).toContain('<p:ic>27232433</p:ic>');
        expect(r).toContain('<p:firmName>ČEZ &amp; spol</p:firmName>');
        expect(r).not.toContain('<p:dbID>');
    });
    test('parse odpovědi → schránky a stav', () => {
        const xml = `<root><dmStatus><dbStatusCode>0000</dbStatusCode></dmStatus>
            <dbOwnerInfo><dbID>abc1234</dbID><dbType>PO</dbType><dbState>1</dbState><firmName>Firma</firmName><ic>12345678</ic></dbOwnerInfo></root>`;
        const res = I.parseFindDataBoxResponse(xml);
        expect(res.status.ok).toBe(true);
        expect(res.boxes).toHaveLength(1);
        expect(res.boxes[0]).toMatchObject({ dbID: 'abc1234', dbState: '1', firmName: 'Firma' });
    });
    test('doručitelnost jen u aktivní schránky (dbState=1)', () => {
        expect(I.isDeliverableState('1')).toBe(true);
        expect(I.isDeliverableState('3')).toBe(false); // znepřístupněná
        expect(I.isDeliverableState('5')).toBe(false); // zrušená
    });
});

describe('CreateMessage', () => {
    test('první příloha = main, další = enclosure; base64 bez bílých znaků', () => {
        const r = I.buildCreateMessageRequest({
            dbIDRecipient: 'xyz9999', annotation: 'Odvolání',
            files: [{ name: 'a.pdf', mimeType: 'application/pdf', base64: 'AA AA\nBB' }, { name: 'b.pdf', base64: 'CC' }]
        });
        expect(r).toContain('<p:dbIDRecipient>xyz9999</p:dbIDRecipient>');
        expect(r).toContain('dmFileMetaType="main"');
        expect(r).toContain('dmFileMetaType="enclosure"');
        expect(r).toContain('<p:dmEncodedContent>AAAABB</p:dmEncodedContent>');
    });
    test('parse dmID z odpovědi', () => {
        const res = I.parseCreateMessageResponse('<x><dmStatusCode>0000</dmStatusCode><dmID>123456</dmID></x>');
        expect(res.dmID).toBe('123456');
        expect(res.status.ok).toBe(true);
    });
});

describe('stavy zprávy (fikce doručení)', () => {
    test('popisky stavů', () => {
        expect(I.messageStatusLabel(5)).toBe('Doručena fikcí');
        expect(I.messageStatusLabel('4')).toBe('Doručena přihlášením');
        expect(I.messageStatusLabel(99)).toBe('Stav 99');
    });
    test('doručeno jen přihlášením (4) nebo fikcí (5)', () => {
        expect(I.isDelivered(4)).toBe(true);
        expect(I.isDelivered('5')).toBe(true);
        expect(I.isDelivered(3)).toBe(false); // jen dodána do schránky
    });
    test('parse GetMessageStateChanges (tolerantní k záznamu)', () => {
        const xml = `<x><dmStatusCode>0000</dmStatusCode>
            <dmRecord><dmID>111</dmID><dmMessageStatus>5</dmMessageStatus><dmStateChanged>2026-07-01T10:00:00</dmStateChanged></dmRecord></x>`;
        const res = I.parseGetMessageStateChangesResponse(xml);
        expect(res.changes[0]).toMatchObject({ dmID: '111', status: '5', statusLabel: 'Doručena fikcí', delivered: true });
    });
});

describe('stažení zprávy (přílohy z atributů dmFile)', () => {
    test('parse obálky + příloh (name/mime z atributů, base64 z obsahu)', () => {
        const xml = `<x><dmStatusCode>0000</dmStatusCode>
            <dmID>777</dmID><dmAnnotation>Předvolání</dmAnnotation><dbIDSender>soud01</dbIDSender>
            <dmFile dmMimeType="application/pdf" dmFileMetaType="main" dmFileDescr="predvolani.pdf">
                <dmEncodedContent>QUJD</dmEncodedContent></dmFile></x>`;
        const res = I.parseMessageDownloadResponse(xml);
        expect(res.envelope).toMatchObject({ dmID: '777', annotation: 'Předvolání', senderId: 'soud01' });
        expect(res.files).toHaveLength(1);
        expect(res.files[0]).toMatchObject({ name: 'predvolani.pdf', mimeType: 'application/pdf', base64: 'QUJD' });
    });
    test('obálka vs plné stažení jsou různé operace (fikce)', () => {
        expect(I.buildMessageEnvelopeDownloadRequest('9')).toContain('MessageEnvelopeDownload');
        expect(I.buildMessageDownloadRequest('9')).toContain('<p:MessageDownload>');
        expect(I.buildMessageEnvelopeDownloadRequest('9')).not.toContain('<p:MessageDownload>');
    });
});

describe('GetOwnerInfoFromLogin (test přihlášení)', () => {
    test('build je prázdný prvek', () => {
        expect(I.buildGetOwnerInfoRequest()).toContain('<p:GetOwnerInfoFromLogin/>');
    });
    test('parse dbID + firmName', () => {
        const res = I.parseGetOwnerInfoResponse('<x><dbStatusCode>0000</dbStatusCode><dbID>my00box</dbID><firmName>AK Novák</firmName></x>');
        expect(res).toMatchObject({ dbID: 'my00box', firmName: 'AK Novák' });
        expect(res.status.ok).toBe(true);
    });
});

describe('podepsaná doručenka', () => {
    test('vytáhne signedData (bez bílých znaků) a události', () => {
        const xml = `<x><dmStatusCode>0000</dmStatusCode><dmID>5</dmID>
            <dmSignature>MII AB\nCD</dmSignature>
            <dmEvent><dmEventTime>2026-07-01</dmEventTime><dmEventDescr>Dodání</dmEventDescr></dmEvent></x>`;
        const res = I.parseGetSignedDeliveryInfoResponse(xml);
        expect(res.signedData).toBe('MIIABCD');
        expect(res.events[0]).toMatchObject({ descr: 'Dodání' });
    });
});
