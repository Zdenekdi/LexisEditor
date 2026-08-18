const { app, BrowserWindow, ipcMain, dialog, safeStorage, systemPreferences, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const HTMLToDOCX = require('html-to-docx');
const axios = null; // Removed in favor of native fetch
const pdf = require('pdf-parse');
const forge = require('node-forge');
const crypto = require('crypto');
const lexisLinkSec = require('./js/core/lexis-link-security.js');
const lexisLock = require('./js/core/lexis-lock.js');
const lexisZfo = require('./js/core/lexis-zfo.js');
const isdsClient = require('./js/core/isds-client.js');
const isdsTransport = require('./js/core/isds-transport.js');
const { IsdsOutbox } = require('./js/core/isds-outbox.js');
const { IsdsInbox } = require('./js/core/isds-inbox.js');

// POST přes klientský certifikát (mTLS) — pro přihlášení certifikátem k ISDS.
// tls = { pfx?, passphrase?, cert?, key? }.
function httpsPostWithCert(url, headers, body, tls) {
    const https = require('https');
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            method: 'POST',
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers),
            timeout: 30000
        };
        if (tls) Object.assign(options, tls); // pfx+passphrase nebo cert+key
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => (data += c));
            res.on('end', () => resolve({
                httpStatus: res.statusCode,
                ok: res.statusCode >= 200 && res.statusCode < 300,
                text: data, url
            }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('ISDS: časový limit spojení vypršel.')));
        req.write(body);
        req.end();
    });
}

// Sdílené volání ISDS webové služby.
// creds = { login, pass, env, host?, basePath?, certPfx?, certPass?, certPem?, keyPem? }.
// service = 'messages'|'info'|'search'|'manage', operation = název operace (pro SOAPAction).
async function isdsCall(creds, service, operation, soapBody) {
    // Certifikát může přijít jako buffer (certPfx) nebo cesta k .p12 (certPath) — druhé
    // umožňuje ověřit spojení rovnou z formuláře, ještě před uložením konfigurace.
    let certPfx = creds && creds.certPfx;
    if (!certPfx && creds && creds.certPath) {
        try { certPfx = fs.readFileSync(creds.certPath); } catch (e) { /* padneme na Basic auth */ }
    }
    // Rozhodovací logika (prostředí, endpoint, Basic auth, mTLS) je v testovaném
    // modulu js/core/isds-transport.js. Zde zůstává už jen I/O a HTTP.
    const { url, headers, useCert, tls } = isdsTransport.buildRequest(creds, service, operation, { isdsClient, certPfx });

    if (useCert) {
        return httpsPostWithCert(url, headers, soapBody, tls);
    }

    // Standardní cesta (jméno+heslo, bez certifikátu).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: soapBody,
            signal: controller.signal
        });
        const text = await response.text();
        return { httpStatus: response.status, ok: response.ok, text, url };
    } finally {
        clearTimeout(timeoutId);
    }
}

// Ověří dostupnost systémového šifrování (Keychain/DPAPI/keyring). Na systémech
// bez něj by safeStorage.encryptString vyhodil výjimku — raději hlásíme jasnou
// chybu a citlivá data neuložíme, než abychom je ukládali v plaintextu.
function ensureSafeStorage() {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Systémové šifrování (Keychain/DPAPI) není na tomto zařízení dostupné, citlivé údaje nebyly uloženy.');
    }
    // Na Linuxu bez keyringu používá Electron backend „basic_text" = jen
    // obfuskace, ne šifrování (isEncryptionAvailable přesto vrací true).
    // Upozorníme (neblokujeme — jinak by na takových systémech nešlo uložit nic).
    try {
        if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
            && safeStorage.getSelectedStorageBackend() === 'basic_text') {
            console.warn('[SafeStorage] Linux: backend „basic_text" — citlivé údaje NEJSOU silně šifrovány (chybí systémový keyring).');
        }
    } catch (e) { /* getSelectedStorageBackend nemusí být dostupné */ }
}

// Synchronní šifrování malých blobů pro renderer (šifrování dokumentů uložených
// v localStorage at-rest — historie verzí, autosave). Renderer nemá šifrovací
// klíč; šifrujeme systémovým safeStorage v MAIN procesu. Použit sendSync, aby
// stávající synchronní ukládací kód nemusel být přepisován na async.
ipcMain.on('secure-encrypt-sync', (event, plaintext) => {
    try {
        ensureSafeStorage();
        event.returnValue = safeStorage.encryptString(String(plaintext == null ? '' : plaintext)).toString('base64');
    } catch (e) { event.returnValue = null; }
});
ipcMain.on('secure-decrypt-sync', (event, b64) => {
    try {
        if (!b64) { event.returnValue = ''; return; }
        event.returnValue = safeStorage.decryptString(Buffer.from(String(b64), 'base64'));
    } catch (e) { event.returnValue = null; }
});

// Extrakce textu ze souboru (PDF) — pro vytažení č.j./sp. zn. z PŘÍLOH přijaté
// datové zprávy (často jsou právě v PDF, ne v předmětu). Vrací { text }.
ipcMain.handle('extract-file-text', async (event, filePath) => {
    try {
        if (!filePath || !fs.existsSync(filePath)) return { text: '' };
        if (!/\.pdf$/i.test(String(filePath))) return { text: '' }; // zatím jen PDF
        const buf = fs.readFileSync(filePath);
        const data = await pdf(buf);
        return { text: (data && data.text) || '' };
    } catch (e) {
        return { text: '', error: e.message };
    }
});

let mainWindow;

// --- BIOMETRIC / TOUCH ID SUPPORT ---
ipcMain.handle('authenticate-biometric', async (event, reason) => {
    if (process.platform === 'darwin') {
        try {
            if (!systemPreferences.canPromptTouchID()) {
                return { success: false, error: 'Touch ID není na tomto zařízení dostupné nebo nastavené.' };
            }
            await systemPreferences.promptTouchID(reason || 'Ověření pro přístup k zabezpečeným údajům');
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    } else if (process.platform === 'win32') {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            // Důvod se NIKDY neinterpoluje do těla skriptu (obrana proti PowerShell
            // injection). Předává se přes proměnnou prostředí a ve skriptu se jen čte.
            const safeReason = String(reason || 'Ověření pro přístup k zabezpečeným údajům')
                .replace(/[\r\n]+/g, ' ')
                .slice(0, 200);
            const psScript = `
                [Void][System.Reflection.Assembly]::LoadWithPartialName("System.Runtime.WindowsRuntime")
                try {
                    $reason = $env:LEXIS_BIO_REASON
                    $status = [Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($reason).GetAwaiter().GetResult()
                    if ($status -eq "Verified") {
                        Write-Output "SUCCESS"
                    } else {
                        Write-Output "ERROR: $status"
                    }
                } catch {
                    Write-Output "ERROR: $_"
                }
            `.trim();

            const tempScriptPath = path.join(app.getPath('temp'), 'verify_hello.ps1');
            fs.writeFileSync(tempScriptPath, psScript, 'utf-8');

            exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, { env: { ...process.env, LEXIS_BIO_REASON: safeReason } }, (error, stdout) => {
                try { fs.unlinkSync(tempScriptPath); } catch(e) {}
                if (error) {
                    resolve({ success: false, error: error.message });
                } else {
                    const output = stdout.trim();
                    if (output === "SUCCESS") {
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, error: output || "Ověření Windows Hello selhalo." });
                    }
                }
            });
        });
    } else {
        return { success: false, error: 'Biometrické ověření není na této platformě podporováno.' };
    }
});

let autoUpdater;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        titleBarStyle: 'hidden', // Moderní "frameless" vzhled pro Mac
        trafficLightPosition: { x: 15, y: 15 },
        icon: path.join(__dirname, 'build', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
}

app.setName('LexisEditor');

// Vlastní aplikační menu — aby se v liště (a v „O aplikaci") místo výchozího
// „Electron" ukazovalo „LexisEditor" a menu bylo české. Pozn.: v čistě vývojovém
// běhu (electron .) může macOS u úplně prvního menu stále zobrazit „Electron";
// v ZABALENÉ aplikaci (productName: LexisEditor) je název správně všude.
function buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
        ...(isMac ? [{
            label: 'LexisEditor',
            submenu: [
                { role: 'about', label: 'O aplikaci LexisEditor' },
                { type: 'separator' },
                { role: 'services', label: 'Služby' },
                { type: 'separator' },
                { role: 'hide', label: 'Skrýt LexisEditor' },
                { role: 'hideOthers', label: 'Skrýt ostatní' },
                { role: 'unhide', label: 'Zobrazit vše' },
                { type: 'separator' },
                { role: 'quit', label: 'Ukončit LexisEditor' }
            ]
        }] : []),
        {
            label: 'Úpravy',
            submenu: [
                { role: 'undo', label: 'Zpět' },
                { role: 'redo', label: 'Vpřed' },
                { type: 'separator' },
                { role: 'cut', label: 'Vyjmout' },
                { role: 'copy', label: 'Kopírovat' },
                { role: 'paste', label: 'Vložit' },
                { role: 'selectAll', label: 'Vybrat vše' }
            ]
        },
        {
            label: 'Zobrazení',
            submenu: [
                { role: 'reload', label: 'Načíst znovu' },
                { role: 'toggleDevTools', label: 'Vývojářské nástroje' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Skutečná velikost' },
                { role: 'zoomIn', label: 'Zvětšit' },
                { role: 'zoomOut', label: 'Zmenšit' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Celá obrazovka' }
            ]
        },
        {
            label: 'Okno',
            submenu: [
                { role: 'minimize', label: 'Minimalizovat' },
                { role: 'zoom', label: 'Zvětšit okno' },
                ...(isMac
                    ? [{ type: 'separator' }, { role: 'front', label: 'Přenést vše dopředu' }]
                    : [{ role: 'close', label: 'Zavřít' }])
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    // Vlastní ikona i ve vývoji (bez ní macOS ukazuje Electron ikonu v Docku)
    if (process.platform === 'darwin' && app.dock) {
        try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch (e) {}
    }
    try {
        app.setAboutPanelOptions({ applicationName: 'LexisEditor', applicationVersion: app.getVersion(), copyright: 'LexisEditor' });
    } catch (e) {}
    try { buildAppMenu(); } catch (e) {}
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Po startu obnovit sledování doručenek, pokud z minula zbyly nedoručené zprávy.
    setTimeout(() => { try { ensureDeliveryPoller(); } catch (e) {} }, 8000);

    // --- AUTO-UPDATER LOGIC ---
    if (autoUpdater) {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        
        autoUpdater.checkForUpdatesAndNotify().catch(e => console.error("Update error: ", e));

        autoUpdater.on('update-available', () => {
            if (mainWindow) mainWindow.webContents.send('update-message', { type: 'available' });
        });

        autoUpdater.on('download-progress', (progressObj) => {
            let percent = Math.round(progressObj.percent);
            if (mainWindow) mainWindow.webContents.send('update-message', { type: 'progress', percent: percent });
        });

        autoUpdater.on('update-downloaded', () => {
            if (mainWindow) mainWindow.webContents.send('update-message', { type: 'downloaded' });
        });
    }
});

ipcMain.on('install-update', () => {
    if (autoUpdater) autoUpdater.quitAndInstall();
});

// IPC Handler pro získání verze aplikace z package.json
ipcMain.handle('get-version', () => {
    return app.getVersion();
});

// API token LexisLocal backendu čteme přímo z lokálního souboru (~/.lexislocal/api_token,
// resp. LEXIS_KEY_DIR) — editor běží na stejném stroji jako backend, takže token
// nemusí uživatel nikam vkládat. Sync varianta pro synchronní čtení v preloadu.
function readLexisLocalToken() {
    try {
        const dir = process.env.LEXIS_KEY_DIR || path.join(os.homedir(), '.lexislocal');
        const p = path.join(dir, 'api_token');
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
    } catch (e) { return ''; }
}
ipcMain.handle('get-lexislocal-token', () => readLexisLocalToken());
ipcMain.on('get-lexislocal-token-sync', (event) => { event.returnValue = readLexisLocalToken(); });

// ─── Licencování / entitlement (PŘIPRAVENO, ZATÍM NEAKTIVNÍ) ─────────────────
// Aktivace: (1) vlož veřejný klíč do js/core/lexis-license-key.js,
//           (2) přepni LICENSING_ENABLED = true. Pak app bere edici z licence
//           místo výchozí 'full'. Detaily: docs/LICENCE_SYSTEM.md
const { verifyLicense, tierToEditionId } = require('./js/core/lexis-license');
const { LICENSE_PUBLIC_KEY_PEM } = require('./js/core/lexis-license-key');
const LICENSING_ENABLED = false; // ← MASTER VYPÍNAČ (nechat false, dokud nebude prodej)
const licensePath = path.join(app.getPath('userData'), 'lexis_license.json');

function readLicenseStatus() {
    if (!LICENSING_ENABLED) return { enabled: false, valid: false, tier: null, editionId: null, reason: 'disabled' };
    let license = null;
    try { if (fs.existsSync(licensePath)) license = JSON.parse(fs.readFileSync(licensePath, 'utf-8')); } catch (e) {}
    const r = verifyLicense(license, LICENSE_PUBLIC_KEY_PEM);
    return {
        enabled: true,
        valid: r.valid,
        tier: r.tier,
        editionId: r.valid ? tierToEditionId(r.tier) : null,
        reason: r.reason,
        expires: r.expires || null,
        name: r.name || '',
        seats: r.seats || 1
    };
}

// Pro UI/nastavení (async) i pro synchronní volbu edice při startu rendereru.
ipcMain.handle('get-license-status', () => readLicenseStatus());
ipcMain.on('get-license-edition-sync', (event) => {
    const st = readLicenseStatus();
    event.returnValue = (st.enabled && st.valid && st.editionId) ? st.editionId : '';
});

// Start aplikace
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// Sdílené nastavení DOCX exportu — cílí na český soudní standard: formát A4,
// okraje 2,5 cm (záhlaví/zápatí 1,25 cm), čeština (`cs-CZ` → dělení slov a
// kontrola pravopisu ve Wordu) a stránkování. Písmo, velikost a řádkování se
// záměrně NEvnucují — přebírají se z obsahu editoru (WYSIWYG), aby se náhled
// na obrazovce a výsledné .docx nerozcházely. Dřív se exportoval formát
// US Letter (default knihovny), což pro česká podání k soudu neodpovídá.
function buildDocxOptions(headerHtml, footerHtml, extra) {
    return Object.assign({
        orientation: 'portrait',
        pageSize: { width: 11906, height: 16838 }, // A4 210×297 mm v twip (1 mm ≈ 56,693 twip)
        margins: { top: 1417, right: 1417, bottom: 1417, left: 1417, header: 708, footer: 708, gutter: 0 },
        lang: 'cs-CZ',
        creator: 'LexisEditor',
        table: { row: { cantSplit: true } },
        header: !!headerHtml,
        footer: !!footerHtml,
        pageNumber: true,
    }, extra || {});
}

// Zpracování požadavku z UI na export do DOCX
ipcMain.handle('export-docx', async (event, htmlContent, headerHtml, footerHtml) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Uložit dokument',
            defaultPath: 'Dokument_LexisEditor.docx',
            filters: [
                { name: 'Word Dokument', extensions: ['docx'] }
            ]
        });

        if (filePath) {
            // Konverze HTML (z Quill editoru) do čistého DOCX bufferu.
            // header:true je nutné, jinak se předaná hlavička do DOCX nevloží.
            const fileBuffer = await HTMLToDOCX(htmlContent, headerHtml || null, buildDocxOptions(headerHtml, footerHtml), footerHtml || null);
            
            // Fyzický zápis souboru na lokální disk
            fs.writeFileSync(filePath, fileBuffer);
            return { success: true, path: filePath };
        }
        return { success: false, canceled: true };
    } catch (error) {
        console.error('Chyba při generování DOCX:', error);
        return { success: false, error: error.message };
    }
});

// Word-parita: CHYTRÝ export do DOCX. Pro dokumenty se sledovanými změnami,
// poznámkami pod čarou nebo obsahem (TOC) použije nativní OOXML cestu (knihovna
// `docx`), která tyto konstrukce umí (w:ins/w:del, word/footnotes.xml, pole TOC).
// Pro běžné dokumenty i při jakékoli chybě padá zpět na osvědčený html-to-docx.
ipcMain.handle('export-docx-v2', async (event, payload) => {
    payload = payload || {};
    const { deltaOps, html, headerHtml, footerHtml, headerLines, footerLines, title } = payload;
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Uložit dokument',
            defaultPath: (title ? title.replace(/[^\w\sá-žÁ-Ž.-]/g, '').trim() : 'Dokument_LexisEditor') + '.docx',
            filters: [{ name: 'Word Dokument', extensions: ['docx'] }]
        });
        if (!filePath) return { success: false, canceled: true };

        let useNative = false;
        try {
            const { needsNativeExport } = require('./js/export/delta-to-model');
            useNative = !!(deltaOps && needsNativeExport({ ops: deltaOps }));
        } catch (e) { useNative = false; }

        let buffer;
        let usedNative = false;
        if (useNative) {
            try {
                const { deltaToModel } = require('./js/export/delta-to-model');
                const { modelToDocxBuffer } = require('./js/export/model-to-docx');
                const model = deltaToModel({ ops: deltaOps }, { title, headerLines, footerLines });
                buffer = await modelToDocxBuffer(model);
                usedNative = true;
            } catch (e) {
                console.error('Nativní OOXML export selhal, fallback na html-to-docx:', e.message);
            }
        }
        if (!buffer) {
            buffer = await HTMLToDOCX(html, headerHtml || null, buildDocxOptions(headerHtml, footerHtml), footerHtml || null);
        }
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath, native: usedNative };
    } catch (error) {
        console.error('Chyba při chytrém generování DOCX:', error);
        return { success: false, error: error.message };
    }
});

// Word-parita: nativní IMPORT z .docx se zachováním sledovaných změn (w:ins/w:del)
// a poznámek pod čarou — to mammoth zahazuje. Vrací HTML pro editor. Volá se jen
// když dokument revize/poznámky obsahuje; jinak zůstává mammoth (viz importDocument).
ipcMain.handle('import-docx-native', async (event, arrayBuffer) => {
    try {
        const JSZip = require('jszip');
        const { ooxmlToHtml } = require('./js/export/ooxml-to-html');
        const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
        const docFile = zip.file('word/document.xml');
        if (!docFile) return { success: false, error: 'Neplatný .docx (chybí document.xml).' };
        const docXml = await docFile.async('string');
        const fnFile = zip.file('word/footnotes.xml');
        const fnXml = fnFile ? await fnFile.async('string') : '';
        // Nativní cesta má smysl jen když dokument obsahuje revize/poznámky —
        // jinak je mammoth (tabulky, obrázky, seznamy) věrnější. Renderer se dle
        // `hasTracked` rozhodne.
        const hasTracked = /<w:ins\b|<w:del\b|<w:footnoteReference\b/.test(docXml);
        const html = ooxmlToHtml(docXml, fnXml);
        return { success: true, html, hasTracked };
    } catch (error) {
        console.error('Nativní import DOCX selhal:', error.message);
        return { success: false, error: error.message };
    }
});

// IPC Handler pro vyhledávání v ARES (Česká republika)
ipcMain.handle('search-ares', async (event, ico) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

    try {
        // Nové REST API Ministerstva financí
        const response = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`Chyba ARES API: ${response.status} ${response.statusText}`);
        }
        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            console.error('Chyba při parsování odpovědi ARES API:', jsonErr);
            throw new Error(`ARES vrátil neplatná data: ${jsonErr.message}`);
        }
        
        // Zkompilování odpovědi do čistého objektu pro frontend
        return {
            success: true,
            data: {
                ico: data.ico,
                dic: data.dic || 'Není plátce DPH',
                obchodniJmeno: data.obchodniJmeno,
                sidlo: data.sidlo ? `${data.sidlo.textAdresy}` : 'Neznámé sídlo',
                pravniForma: data.pravniForma || 'Neznámá forma'
            }
        };
    } catch (error) {
        console.error('Chyba při volání ARES:', error);
        if (error.name === 'AbortError') {
            return { success: false, error: 'Vypršel časový limit (15s) pro spojení s ARES API.' };
        }
        return { success: false, error: error.message };
    } finally {
        clearTimeout(timeoutId);
    }
});

// Logika pro ukládání a načítání uživatelských šablon
const templatesPath = path.join(app.getPath('userData'), 'lexis_templates.json');

const defaultTemplates = {
    "kupni": {
        "title": "Kupní smlouva",
        "desc": "Prodej věci movité / nemovité",
        "icon": "🤝",
        "content": "<h1 class=\"ql-align-center\">KUPNÍ SMLOUVA</h1><p><br></p><p class=\"ql-align-center\">uzavřená podle § 2079 a násl. zákona č. 89/2012 Sb., občanský zákoník, v platném znění</p><p><br></p><p><strong>I. Smluvní strany</strong></p><p><strong>Prodávající:</strong> [JMÉNO / NÁZEV], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA], bankovní spojení: [ÚČET]</p><p><strong>Kupující:</strong> [JMÉNO / NÁZEV], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA]</p><p><br></p><p><strong>II. Předmět koupě</strong></p><p>Předmětem této smlouvy je [POPIS PŘEDMĚTU KOUPĚ] (dále jen „předmět koupě“). Prodávající prohlašuje, že je výlučným vlastníkem předmětu koupě a že na něm neváznou žádná práva třetích osob.</p><p><br></p><p><strong>III. Kupní cena a platební podmínky</strong></p><p>Kupní cena činí [ČÁSTKA] Kč (slovy: [SLOVY]). Kupní cena je splatná do [POČET] dnů od podpisu této smlouvy na účet prodávajícího uvedený v čl. I.</p><p><br></p><p><strong>IV. Předání a nabytí vlastnictví</strong></p><p>Prodávající předá předmět koupě kupujícímu nejpozději dne [DATUM]. Vlastnické právo nabývá kupující [okamžikem úplného zaplacení kupní ceny / převzetím předmětu koupě].</p><p><br></p><p><strong>V. Závěrečná ustanovení</strong></p><p>Tato smlouva se vyhotovuje ve dvou stejnopisech, z nichž každá strana obdrží po jednom. Smlouva nabývá platnosti a účinnosti dnem podpisu obou smluvních stran.</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________</p><p>Prodávající&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Kupující</p>"
    },
    "plnamoc": {
        "title": "Plná moc",
        "desc": "Zastoupení advokátem ve věci",
        "icon": "✍️",
        "content": "<h1 class=\"ql-align-center\">PLNÁ MOC</h1><p><br></p><p>Já, níže podepsaný/á [JMÉNO / NÁZEV], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA] (dále jen „zmocnitel“),</p><p><br></p><p class=\"ql-align-center\"><strong>zmocňuji</strong></p><p><br></p><p>advokáta [TITUL JMÉNO], ev. č. ČAK [ČÍSLO], se sídlem [ADRESA] (dále jen „zmocněnec“),</p><p><br></p><p>aby mě zastupoval ve věci [OZNAČENÍ VĚCI], a to ve všech úkonech, řízeních a stupních, včetně řízení před soudy všech stupňů, správními orgány, exekutory a rozhodci. Zmocněnec je oprávněn přijímat doručované písemnosti, uzavírat smíry, vzdát se práva odvolání, podávat opravné prostředky, přijímat plnění a ustanovit si za sebe zástupce.</p><p><br></p><p>Tato plná moc se vztahuje i na úkony, s nimiž zákon spojuje zvláštní plnou moc.</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________</p><p>Zmocnitel</p><p><br></p><p>Plnou moc v celém rozsahu přijímám.</p><p><br></p><p>______________________</p><p>Zmocněnec (advokát)</p>"
    },
    "zaloba": {
        "title": "Žaloba na plnění",
        "desc": "Občanské soudní řízení",
        "icon": "⚖️",
        "content": "<p><strong>Okresnímu soudu v [MĚSTO]</strong></p><p>[ADRESA SOUDU]</p><p><br></p><p><strong>Žalobce:</strong> [JMÉNO], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA], zast. [TITUL JMÉNO], advokátem, ev. č. ČAK [ČÍSLO], se sídlem [ADRESA]</p><p><strong>Žalovaný:</strong> [JMÉNO], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA]</p><p><br></p><h1 class=\"ql-align-center\">ŽALOBA</h1><p class=\"ql-align-center\">o zaplacení částky [ČÁSTKA] Kč s příslušenstvím</p><p><br></p><p class=\"ql-align-center\"><em>dvojmo</em><br><em>Přílohy dle textu</em><br><em>Soudní poplatek bude uhrazen na výzvu soudu</em></p><p><br></p><p><strong>I.</strong></p><p>Žalobce a žalovaný uzavřeli dne [DATUM] [OZNAČENÍ SMLOUVY / PRÁVNÍHO DŮVODU], na jejímž základě [POPIS SKUTKOVÉHO STAVU].</p><p><br></p><p><strong>Důkaz:</strong> [OZNAČENÍ DŮKAZŮ – listiny, výslech, znalecký posudek]</p><p><br></p><p><strong>II.</strong></p><p>Žalovaný svůj závazek ve výši [ČÁSTKA] Kč přes opakované výzvy neuhradil. Žalobce vyzval žalovaného k úhradě předžalobní výzvou ze dne [DATUM] ve smyslu § 142a o.s.ř.; dluh nebyl uhrazen ani do dnešního dne.</p><p><br></p><p><strong>III.</strong></p><p>S ohledem na výše uvedené žalobce navrhuje, aby soud vydal tento</p><p><br></p><p class=\"ql-align-center\"><strong>rozsudek:</strong></p><p><br></p><p>Žalovaný je povinen zaplatit žalobci částku [ČÁSTKA] Kč spolu s úrokem z prodlení ve výši [SAZBA] % ročně z této částky od [DATUM] do zaplacení, a to vše do tří dnů od právní moci tohoto rozsudku. Žalovaný je dále povinen nahradit žalobci náklady řízení k rukám jeho právního zástupce do tří dnů od právní moci tohoto rozsudku.</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________</p><p>[JMÉNO ŽALOBCE]</p>"
    },
    "vyzva": {
        "title": "Předžalobní výzva",
        "desc": "Výzva k úhradě dle § 142a o.s.ř.",
        "icon": "📨",
        "content": "<p>[JMÉNO / NÁZEV VĚŘITELE], [ADRESA]</p><p><br></p><p><strong>Adresát (dlužník):</strong> [JMÉNO / NÁZEV], [ADRESA]</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><h1 class=\"ql-align-center\">PŘEDŽALOBNÍ VÝZVA K ÚHRADĚ</h1><p class=\"ql-align-center\">(výzva podle § 142a zákona č. 99/1963 Sb., občanský soudní řád)</p><p><br></p><p>Vážený/á [OSLOVENÍ],</p><p><br></p><p>na základě [OZNAČENÍ PRÁVNÍHO DŮVODU – např. faktury č. …, smlouvy ze dne …] Vám vznikl vůči mému klientovi / vůči mně dluh ve výši <strong>[ČÁSTKA] Kč</strong>, splatný dne [DATUM]. Tento dluh dosud nebyl uhrazen.</p><p><br></p><p>Vyzývám Vás proto, abyste dlužnou částku [ČÁSTKA] Kč, spolu s úrokem z prodlení, uhradil/a nejpozději do <strong>7 dnů</strong> od doručení této výzvy na účet č. [ÚČET], variabilní symbol [VS].</p><p><br></p><p>Nebude-li dluh v uvedené lhůtě uhrazen, budu nucen/a bez dalšího upozornění uplatnit nárok soudní cestou, čímž Vám vzniknou další náklady (soudní poplatek, náklady právního zastoupení, úroky z prodlení).</p><p><br></p><p>Věřím, že věc vyřešíte smírně a včas.</p><p><br></p><p>S pozdravem</p><p><br></p><p>______________________</p><p>[JMÉNO / TITUL]</p>"
    },
    "smlouvaodilo": {
        "title": "Smlouva o dílo",
        "desc": "Zhotovení díla dle § 2586",
        "icon": "🛠️",
        "content": "<h1 class=\"ql-align-center\">SMLOUVA O DÍLO</h1><p><br></p><p class=\"ql-align-center\">uzavřená podle § 2586 a násl. zákona č. 89/2012 Sb., občanský zákoník</p><p><br></p><p><strong>I. Smluvní strany</strong></p><p><strong>Objednatel:</strong> [JMÉNO / NÁZEV], IČO: [IČO], sídlem [ADRESA]</p><p><strong>Zhotovitel:</strong> [JMÉNO / NÁZEV], IČO: [IČO], sídlem [ADRESA]</p><p><br></p><p><strong>II. Předmět díla</strong></p><p>Zhotovitel se zavazuje provést pro objednatele na svůj náklad a nebezpečí dílo: [POPIS DÍLA], a to řádně a včas. Objednatel se zavazuje dílo převzít a zaplatit cenu díla.</p><p><br></p><p><strong>III. Doba a místo plnění</strong></p><p>Zhotovitel provede dílo v termínu od [DATUM] do [DATUM]. Místem plnění je [MÍSTO].</p><p><br></p><p><strong>IV. Cena díla a platební podmínky</strong></p><p>Cena díla činí [ČÁSTKA] Kč [bez DPH / včetně DPH]. Cena je splatná na základě faktury se splatností [POČET] dnů po předání a převzetí díla.</p><p><br></p><p><strong>V. Předání a převzetí, odpovědnost za vady</strong></p><p>O předání a převzetí díla bude sepsán předávací protokol. Zhotovitel poskytuje na dílo záruku v délce [POČET] měsíců. Práva z vadného plnění se řídí § 2615 a násl. občanského zákoníku.</p><p><br></p><p><strong>VI. Smluvní pokuta</strong></p><p>V případě prodlení zhotovitele s předáním díla je objednatel oprávněn požadovat smluvní pokutu ve výši [SAZBA] % z ceny díla za každý den prodlení.</p><p><br></p><p><strong>VII. Závěrečná ustanovení</strong></p><p>Smlouva je vyhotovena ve dvou stejnopisech. Měnit ji lze pouze písemnými dodatky. Vztahy neupravené touto smlouvou se řídí občanským zákoníkem.</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________</p><p>Objednatel&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Zhotovitel</p>"
    },
    "najemni": {
        "title": "Nájemní smlouva (byt)",
        "desc": "Nájem bytu dle § 2235",
        "icon": "🏠",
        "content": "<h1 class=\"ql-align-center\">SMLOUVA O NÁJMU BYTU</h1><p><br></p><p class=\"ql-align-center\">uzavřená podle § 2235 a násl. zákona č. 89/2012 Sb., občanský zákoník</p><p><br></p><p><strong>I. Smluvní strany</strong></p><p><strong>Pronajímatel:</strong> [JMÉNO], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA]</p><p><strong>Nájemce:</strong> [JMÉNO], r.č.: [RČ], bytem [ADRESA]</p><p><br></p><p><strong>II. Předmět nájmu</strong></p><p>Pronajímatel přenechává nájemci k zajištění bytových potřeb byt č. [ČÍSLO] o velikosti [DISPOZICE] a výměře [VÝMĚRA] m2, nacházející se na adrese [ADRESA] (dále jen „byt“).</p><p><br></p><p><strong>III. Doba nájmu</strong></p><p>Nájem se sjednává na dobu [určitou od [DATUM] do [DATUM] / neurčitou od [DATUM]].</p><p><br></p><p><strong>IV. Nájemné a služby</strong></p><p>Nájemné činí [ČÁSTKA] Kč měsíčně. Zálohy na služby spojené s užíváním bytu činí [ČÁSTKA] Kč měsíčně. Nájemné a zálohy jsou splatné vždy do [DEN] dne příslušného kalendářního měsíce na účet č. [ÚČET].</p><p><br></p><p><strong>V. Jistota (kauce)</strong></p><p>Nájemce složil pronajímateli jistotu ve výši [ČÁSTKA] Kč. Jistota bude vrácena při skončení nájmu po odečtení případných dlužných částek.</p><p><br></p><p><strong>VI. Práva a povinnosti</strong></p><p>Nájemce je povinen užívat byt řádně a v souladu s účelem nájmu, provádět běžnou údržbu a drobné opravy. Pronajímatel zajišťuje nájemci nerušené užívání bytu.</p><p><br></p><p><strong>VII. Závěrečná ustanovení</strong></p><p>Smlouva je vyhotovena ve dvou stejnopisech. Neupravené vztahy se řídí občanským zákoníkem.</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________</p><p>Pronajímatel&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Nájemce</p>"
    },
    "odstoupeni": {
        "title": "Odstoupení od smlouvy",
        "desc": "Jednostranné ukončení dle § 2001",
        "icon": "🚪",
        "content": "<p>[JMÉNO / NÁZEV ODESÍLATELE], [ADRESA]</p><p><br></p><p><strong>Adresát:</strong> [JMÉNO / NÁZEV], [ADRESA]</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><h1 class=\"ql-align-center\">ODSTOUPENÍ OD SMLOUVY</h1><p><br></p><p>Dne [DATUM] jsme uzavřeli [OZNAČENÍ SMLOUVY] (dále jen „smlouva“).</p><p><br></p><p>Vzhledem k tomu, že [POPIS DŮVODU – např. podstatné porušení smlouvy, prodlení delší než …, vady plnění], čímž došlo k naplnění důvodu pro odstoupení podle [§ 2002 / § 2106 / ujednání smlouvy] občanského zákoníku,</p><p><br></p><p class=\"ql-align-center\"><strong>tímto od výše uvedené smlouvy odstupuji.</strong></p><p><br></p><p>Odstoupením se smlouva od počátku ruší. Vyzývám Vás proto k vrácení vzájemně poskytnutých plnění, zejména [SPECIFIKACE], a to do [POČET] dnů od doručení tohoto odstoupení na účet č. [ÚČET].</p><p><br></p><p>S pozdravem</p><p><br></p><p>______________________</p><p>[JMÉNO]</p>"
    },
    "uznanidluhu": {
        "title": "Uznání dluhu",
        "desc": "Uznání se splátkovým kalendářem, § 2053",
        "icon": "📑",
        "content": "<h1 class=\"ql-align-center\">UZNÁNÍ DLUHU A DOHODA O SPLÁTKÁCH</h1><p><br></p><p class=\"ql-align-center\">uzavřené podle § 2053 a § 1546 zákona č. 89/2012 Sb., občanský zákoník</p><p><br></p><p><strong>Věřitel:</strong> [JMÉNO / NÁZEV], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA]</p><p><strong>Dlužník:</strong> [JMÉNO / NÁZEV], r.č. / IČO: [HODNOTA], bytem / sídlem [ADRESA]</p><p><br></p><p><strong>I.</strong></p><p>Dlužník tímto výslovně uznává co do důvodu i výše svůj dluh vůči věřiteli ve výši <strong>[ČÁSTKA] Kč</strong>, který vznikl z titulu [OZNAČENÍ PRÁVNÍHO DŮVODU] a byl splatný dne [DATUM].</p><p><br></p><p><strong>II.</strong></p><p>Dlužník se zavazuje uhradit uznaný dluh věřiteli v pravidelných měsíčních splátkách ve výši [ČÁSTKA] Kč, splatných vždy do [DEN] dne v měsíci, počínaje [DATUM], na účet č. [ÚČET].</p><p><br></p><p><strong>III.</strong></p><p>V případě prodlení dlužníka s úhradou byť jediné splátky se stává splatným celý zbytek dluhu najednou (ztráta výhody splátek).</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________</p><p>Věřitel&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Dlužník</p>"
    },
    "odvolani": {
        "title": "Odvolání proti rozsudku",
        "desc": "Opravný prostředek dle § 201 o.s.ř.",
        "icon": "📤",
        "content": "<p><strong>Krajskému soudu v [MĚSTO]</strong></p><p>prostřednictvím <strong>Okresního soudu v [MĚSTO]</strong></p><p><br></p><p><strong>Ke sp. zn.: [SPIS_ZNACKA]</strong></p><p><br></p><p><strong>Odvolatel (žalobce / žalovaný):</strong> [JMÉNO], bytem / sídlem [ADRESA], zast. [TITUL JMÉNO], advokátem</p><p><br></p><h1 class=\"ql-align-center\">ODVOLÁNÍ</h1><p class=\"ql-align-center\">proti rozsudku Okresního soudu v [MĚSTO] ze dne [DATUM], č. j. [SPIS_ZNACKA]</p><p><br></p><p class=\"ql-align-center\"><em>dvojmo</em></p><p><br></p><p><strong>I.</strong></p><p>Rozsudkem uvedeným v záhlaví soud [STRUČNÝ VÝROK NAPADENÉHO ROZSUDKU]. Rozsudek byl odvolateli doručen dne [DATUM]. Odvolání je podáváno včas, ve lhůtě 15 dnů podle § 204 odst. 1 o.s.ř.</p><p><br></p><p><strong>II. Rozsah a důvody odvolání</strong></p><p>Odvolatel napadá rozsudek v celém rozsahu / ve výroku [OZNAČENÍ]. Odvolání se opírá o odvolací důvody podle § 205 odst. 2 o.s.ř., zejména [např. nesprávné právní posouzení věci, nedostatečně zjištěný skutkový stav, vadné hodnocení důkazů].</p><p><br></p><p>[PODROBNÁ ARGUMENTACE ODVOLATELE]</p><p><br></p><p><strong>III. Návrh</strong></p><p>Odvolatel navrhuje, aby odvolací soud napadený rozsudek [změnil tak, že … / zrušil a věc vrátil soudu prvního stupně k dalšímu řízení] a přiznal odvolateli náhradu nákladů řízení před soudy obou stupňů.</p><p><br></p><p>V [MĚSTO] dne [DATUM]</p><p><br></p><p>______________________</p><p>[JMÉNO ODVOLATELE]</p>"
    },
    "hlavicka": {
        "title": "Hlavičkový papír",
        "desc": "Firemní vizuál kanceláře",
        "icon": "📝",
        "content": "<div style=\"border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px;\"><h2 style=\"margin: 0; color: #1e293b;\">Advokátní kancelář [NÁZEV]</h2><p style=\"margin: 0; font-size: 12px; color: #64748b;\">[ADRESA] | IČO: [IČO] | tel.: [TELEFON] | e-mail: [E-MAIL] | ev. č. ČAK: [ČÍSLO]</p></div><p><br></p>"
    }
};

ipcMain.handle('get-templates', () => {
    try {
        if (fs.existsSync(templatesPath)) {
            const rawData = fs.readFileSync(templatesPath, 'utf-8');
            // Sloučit s výchozími: nové vestavěné vzory se objeví i u starších uložených souborů,
            // uživatelské úpravy mají přednost.
            return { ...defaultTemplates, ...JSON.parse(rawData) };
        }
    } catch (e) {
        console.error('Chyba při čtení šablon:', e);
    }
    return defaultTemplates;
});

ipcMain.handle('get-template-content', (event, type) => {
    try {
        let templates = { ...defaultTemplates };
        if (fs.existsSync(templatesPath)) {
            try { templates = { ...defaultTemplates, ...JSON.parse(fs.readFileSync(templatesPath, 'utf-8')) }; } catch (e) {}
        }
        const tpl = templates[type];
        if (!tpl) return { title: '', content: '' };
        if (typeof tpl === 'string') return { title: '', content: tpl };
        return { title: tpl.title || '', content: tpl.content || '' };
    } catch (e) {
        console.error('Chyba při čtení obsahu šablony:', e);
        return { title: '', content: '' };
    }
});

ipcMain.handle('save-template', (event, type, content) => {
    try {
        let currentTemplates = { ...defaultTemplates };
        if (fs.existsSync(templatesPath)) {
            try {
                currentTemplates = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
            } catch(e) {}
        }
        // Zachovat strukturu šablony {title, desc, icon, content}. Když přijde
        // jen řetězec (HTML), aktualizujeme pouze .content; jinak sloučíme objekt.
        const existing = (currentTemplates[type] && typeof currentTemplates[type] === 'object')
            ? currentTemplates[type]
            : {};
        if (typeof content === 'string') {
            currentTemplates[type] = { ...existing, content };
        } else if (content && typeof content === 'object') {
            currentTemplates[type] = { ...existing, ...content };
        } else {
            currentTemplates[type] = existing;
        }
        fs.writeFileSync(templatesPath, JSON.stringify(currentTemplates, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Chyba při ukládání šablony:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('reset-templates', () => {
    try {
        if (fs.existsSync(templatesPath)) {
            fs.unlinkSync(templatesPath);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('export-bundle', async (event, htmlContent, cssContent, headerHtml, footerHtml, watermarkHtml) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportovat Bundle (DOCX + PDF)',
            defaultPath: 'Dokument_LexisEditor',
            filters: [
                { name: 'Dokumenty', extensions: ['docx', 'pdf'] }
            ]
        });

        if (filePath) {
            // Odstranění přípony pro získání základu jména
            const basePath = filePath.replace(/\.(docx|pdf)$/i, '');
            const docxPath = basePath + '.docx';
            const pdfPath = basePath + '.pdf';

            // 1. Export DOCX (header:true jinak hlavička vypadne)
            const docxBuffer = await HTMLToDOCX(htmlContent, headerHtml || null, buildDocxOptions(headerHtml, footerHtml), footerHtml || null);
            fs.writeFileSync(docxPath, docxBuffer);

            // 2. Export PDF přes skryté okno
            const printWindow = new BrowserWindow({
                show: false,
                webPreferences: {
                    offscreen: true
                }
            });
            
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        ${cssContent}
                        body { margin: 0; padding: 0; background: white; }
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <div id="editor-wrapper" style="position:relative; border:none; box-shadow:none; width:auto; min-height:auto; display:flex; flex-direction:column;">
                        ${watermarkHtml ? `<div class="page-watermark" style="position:absolute; inset:0; z-index:0; pointer-events:none; display:flex; align-items:center; justify-content:center; overflow:hidden;">${watermarkHtml}</div>` : ''}
                        ${headerHtml ? `<div class="page-header" id="header-area" style="padding: 10mm 40mm 5mm 40mm !important; min-height: auto;">${headerHtml}</div>` : ''}
                        <div class="ql-container ql-snow" style="border:none; flex-grow:1;">
                            <div class="ql-editor">${htmlContent}</div>
                        </div>
                        ${footerHtml ? `<div class="page-footer" id="footer-area" style="padding: 5mm 40mm 10mm 40mm !important; margin-top: auto;">${footerHtml}</div>` : ''}
                    </div>
                </body>
                </html>
            `;
            
            try {
                await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

                const pdfBuffer = await printWindow.webContents.printToPDF({
                    // marginsType:1 je zastaralé (dvojité okraje). Okraje řeší CSS.
                    margins: { marginType: 'none' },
                    pageSize: 'A4',
                    printBackground: true,
                    landscape: false
                });

                fs.writeFileSync(pdfPath, pdfBuffer);
            } finally {
                // Okno vždy uklidit — i při chybě, jinak dochází k leaku.
                if (!printWindow.isDestroyed()) printWindow.destroy();
            }

            return { success: true, docxPath, pdfPath };
        }
        return { success: false, canceled: true };
    } catch (error) {
        console.error('Chyba při generování Bundlu:', error);
        return { success: false, error: error.message };
    }
});

// --- ISDS BRIDGE (Datové schránky) ---
const isdsConfigPath = path.join(app.getPath('userData'), 'isds_config.json');

ipcMain.handle('save-isds-config', async (event, config) => {
    try {
        // Šifrování hesla pomocí systému (Windows DPAPI / Mac Keychain)
        ensureSafeStorage();
        // Formulář heslo NEpředvyplňuje (nevrací se do rendereru). Prázdné pole
        // proto znamená „ponech dříve uložené heslo", ne „smaž ho".
        let prev = null;
        try { if (fs.existsSync(isdsConfigPath)) prev = JSON.parse(fs.readFileSync(isdsConfigPath, 'utf-8')); } catch (e) { /* ignore */ }
        const encryptedPassword = config.password
            ? safeStorage.encryptString(config.password).toString('base64')
            : (prev && prev.password ? prev.password : safeStorage.encryptString('').toString('base64'));
        const configToSave = {
            login: config.login,
            password: encryptedPassword,
            environment: config.environment || 'production'
        };
        // Volitelné přihlášení klientským certifikátem (.p12/.pfx). Heslo k certifikátu
        // se šifruje stejně; prázdné pole zachová dříve uložené (stejně jako heslo).
        if (config.certPath) configToSave.certPath = config.certPath;
        else if (prev && prev.certPath) configToSave.certPath = prev.certPath;
        if (config.certPassphrase) {
            configToSave.certPassphrase = safeStorage.encryptString(config.certPassphrase).toString('base64');
        } else if (prev && prev.certPassphrase) {
            configToSave.certPassphrase = prev.certPassphrase;
        }
        fs.writeFileSync(isdsConfigPath, JSON.stringify(configToSave, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Chyba při ukládání ISDS konfigurace:', e);
        return { success: false, error: e.message };
    }
});

// Výběr souboru klientského certifikátu (.p12/.pfx) pro přihlášení certifikátem.
ipcMain.handle('pick-isds-cert', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Vyberte klientský certifikát (.p12 / .pfx)',
        filters: [{ name: 'Certifikát', extensions: ['p12', 'pfx'] }],
        properties: ['openFile']
    });
    if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: filePaths[0] };
});

ipcMain.handle('get-isds-config', async () => {
    try {
        if (fs.existsSync(isdsConfigPath)) {
            const rawData = JSON.parse(fs.readFileSync(isdsConfigPath, 'utf-8'));
            // BEZPEČNOST: heslo se NIKDY nevrací do rendereru (jinak by ho mohlo
            // vyexfiltrovat případné XSS). Odesílání i test čtou heslo v main
            // procesu (readIsdsCreds). Renderer dostane jen příznak hasPassword.
            return {
                login: rawData.login,
                hasPassword: !!rawData.password,
                environment: rawData.environment,
                certPath: rawData.certPath || '',
                hasCert: !!rawData.certPath,
                hasConfig: true
            };
        }
    } catch (e) {
        console.error('Chyba při načítání ISDS konfigurace:', e);
    }
    return { hasConfig: false };
});

// --- ZÁLOHA / OBNOVA ŠIFROVACÍHO KLÍČE ---
// Klíč k datům (DB, RAG, audit) leží MIMO datovou složku (~/.lexislocal/lexis.key),
// aby se nesynchronizoval s daty. Důsledek: ztráta klíče = ztráta dat. Proto musí
// jít klíč zálohovat a obnovit. Cesta odpovídá secure_crypto v LexisLocal (LEXIS_KEY_DIR).
const LEXIS_KEY_DIR = process.env.LEXIS_KEY_DIR || path.join(os.homedir(), '.lexislocal');
const LEXIS_KEY_PATH = path.join(LEXIS_KEY_DIR, 'lexis.key');

function keyFingerprint() {
    try {
        const hex = fs.readFileSync(LEXIS_KEY_PATH, 'utf8').trim();
        return crypto.createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex').slice(0, 16);
    } catch (e) { return null; }
}

ipcMain.handle('key-status', async () => {
    const exists = fs.existsSync(LEXIS_KEY_PATH);
    return { exists, path: LEXIS_KEY_PATH, fingerprint: exists ? keyFingerprint() : null };
});

ipcMain.handle('key-backup', async () => {
    try {
        if (!fs.existsSync(LEXIS_KEY_PATH)) return { success: false, error: 'Klíč zatím neexistuje (spusťte nejdřív LexisLocal).' };
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Zálohovat šifrovací klíč',
            defaultPath: 'lexis-klic-zaloha.key',
            filters: [{ name: 'Šifrovací klíč', extensions: ['key'] }]
        });
        if (canceled || !filePath) return { success: false, canceled: true };
        fs.copyFileSync(LEXIS_KEY_PATH, filePath);
        try { fs.chmodSync(filePath, 0o600); } catch (e) {}
        return { success: true, path: filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('key-restore', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Obnovit šifrovací klíč ze zálohy',
            filters: [{ name: 'Šifrovací klíč', extensions: ['key'] }],
            properties: ['openFile']
        });
        if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };
        const hex = fs.readFileSync(filePaths[0], 'utf8').trim();
        if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
            return { success: false, error: 'Soubor neobsahuje platný 256bitový klíč.' };
        }
        fs.mkdirSync(LEXIS_KEY_DIR, { recursive: true });
        // Zazálohovat stávající klíč (kdyby šlo o omyl), pak přepsat.
        if (fs.existsSync(LEXIS_KEY_PATH)) {
            try { fs.copyFileSync(LEXIS_KEY_PATH, LEXIS_KEY_PATH + '.prev'); } catch (e) {}
        }
        fs.writeFileSync(LEXIS_KEY_PATH, hex, { encoding: 'utf8', mode: 0o600 });
        try { fs.chmodSync(LEXIS_KEY_PATH, 0o600); } catch (e) {}
        return { success: true, fingerprint: keyFingerprint() };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- ISDS OUTBOX (odesílací fronta datových zpráv) ---
let _isdsOutbox = null;
function getOutbox() {
    if (!_isdsOutbox) {
        _isdsOutbox = new IsdsOutbox({ filePath: path.join(app.getPath('userData'), 'isds_outbox.json') });
    }
    return _isdsOutbox;
}

// Interní načtení ISDS údajů (login/heslo/prostředí) z uložené konfigurace.
function readIsdsCreds() {
    if (!fs.existsSync(isdsConfigPath)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(isdsConfigPath, 'utf-8'));
        const password = safeStorage.decryptString(Buffer.from(raw.password, 'base64'));
        const creds = { login: raw.login, pass: password, env: raw.environment || 'production' };
        // Volitelný klientský certifikát (.p12/.pfx) pro přihlášení certifikátem.
        if (raw.certPath && fs.existsSync(raw.certPath)) {
            try {
                creds.certPfx = fs.readFileSync(raw.certPath);
                if (raw.certPassphrase) {
                    creds.certPass = safeStorage.decryptString(Buffer.from(raw.certPassphrase, 'base64'));
                }
            } catch (certErr) {
                console.error('ISDS: nelze načíst certifikát:', certErr.message);
            }
        }
        return creds;
    } catch (e) {
        console.error('ISDS: nelze načíst údaje:', e.message);
        return null;
    }
}

// Odešle jednu položku fronty přes CreateMessage.
async function outboxSendOne(item) {
    const creds = readIsdsCreds();
    if (!creds || !creds.login) return { success: false, error: 'Chybí přihlašovací údaje k datové schránce.' };
    const soapBody = isdsClient.buildCreateMessageRequest({
        dbIDRecipient: item.recipient.dbID,
        annotation: item.subject,
        files: item.files
    });
    const res = await isdsCall(creds, 'messages', 'CreateMessage', soapBody);
    const parsed = isdsClient.parseCreateMessageResponse(res.text);
    if (parsed.status.ok && parsed.dmID) return { success: true, dmID: parsed.dmID };
    return { success: false, error: parsed.status.message || `Odeslání selhalo (HTTP ${res.httpStatus}).` };
}

let _outboxTick = false;
async function runOutbox() {
    if (_outboxTick) return;
    _outboxTick = true;
    try {
        // Opakuj, dokud jsou položky pending (process se po chybě zastaví kvůli backoffu).
        for (let i = 0; i < 100; i++) {
            const r = await getOutbox().process(outboxSendOne);
            if (getOutbox().getByStatus('pending').length === 0 || r.processed === 0) break;
            await new Promise(res => setTimeout(res, 1500)); // jemný backoff mezi koly
        }
    } finally {
        _outboxTick = false;
    }
    if (mainWindow) mainWindow.webContents.send('isds-outbox-changed');
    ensureDeliveryPoller(); // po odeslání začni automaticky sledovat doručení
}

// --- Automatická fronta doručenek ---
// Periodicky dotahuje stavy doručení odeslaných zpráv (GetMessageStateChanges),
// dokud jsou nějaké nedoručené. Šetří ISDS: běží jen když je co sledovat.
let _deliveryPoller = null;
const DELIVERY_POLL_MS = 20 * 60 * 1000; // 20 minut

function outboxHasUndelivered() {
    return getOutbox().getAll().some(i => i.status === 'sent'); // odesláno, zatím nedoručeno
}

async function pollDeliveryOnce() {
    const creds = readIsdsCreds();
    if (!creds || !creds.login) return;
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const to = new Date().toISOString();
    try {
        const soapBody = isdsClient.buildGetMessageStateChangesRequest(from, to);
        const res = await isdsCall(creds, 'info', 'GetMessageStateChanges', soapBody);
        const parsed = isdsClient.parseGetMessageStateChangesResponse(res.text);
        const updated = getOutbox().applyStateChanges(parsed.changes);
        if (updated && mainWindow) mainWindow.webContents.send('isds-outbox-changed');
    } catch (e) {
        console.error('Delivery poll error:', e.message);
    }
}

function ensureDeliveryPoller() {
    if (_deliveryPoller) return;
    if (!outboxHasUndelivered()) return;
    // Hned jeden dotaz, pak periodicky.
    pollDeliveryOnce();
    _deliveryPoller = setInterval(async () => {
        if (!outboxHasUndelivered()) { clearInterval(_deliveryPoller); _deliveryPoller = null; return; }
        await pollDeliveryOnce();
    }, DELIVERY_POLL_MS);
}

// Hromadné zařazení do fronty (i více příjemců pro stejný dokument).
// recipients = [{ dbID, name? }], payload = { subject, files:[{name,mimeType,base64}] }
ipcMain.handle('isds-outbox-enqueue', async (event, recipients, payload) => {
    try {
        const items = getOutbox().enqueueBatch(recipients, payload);
        runOutbox(); // nečekáme — běží na pozadí
        return { success: true, enqueued: items.length, items };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('isds-outbox-list', async () => {
    try { return { success: true, items: getOutbox().getAll() }; }
    catch (e) { return { success: false, error: e.message, items: [] }; }
});

ipcMain.handle('isds-outbox-retry', async (event, id) => {
    try { getOutbox().retry(id); runOutbox(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

// Dotáhne stavy doručení hromadně (GetMessageStateChanges) a aktualizuje frontu.
ipcMain.handle('isds-outbox-refresh-status', async (event, fromTime) => {
    try {
        const creds = readIsdsCreds();
        if (!creds || !creds.login) return { success: false, error: 'Chybí přihlašovací údaje k datové schránce.' };
        const from = fromTime || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const to = new Date().toISOString();
        const soapBody = isdsClient.buildGetMessageStateChangesRequest(from, to);
        const res = await isdsCall(creds, 'info', 'GetMessageStateChanges', soapBody);
        const parsed = isdsClient.parseGetMessageStateChangesResponse(res.text);
        const updated = getOutbox().applyStateChanges(parsed.changes);
        return { success: true, updated, items: getOutbox().getAll() };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Uloží PODEPSANOU doručenku (CMS) jako právní doklad k odeslané zprávě.
ipcMain.handle('isds-save-signed-delivery', async (event, dmID) => {
    try {
        const creds = readIsdsCreds();
        if (!creds || !creds.login) return { success: false, error: 'Chybí přihlašovací údaje k datové schránce.' };
        const soapBody = isdsClient.buildGetSignedDeliveryInfoRequest(dmID);
        const res = await isdsCall(creds, 'info', 'GetSignedDeliveryInfo', soapBody);
        const parsed = isdsClient.parseGetSignedDeliveryInfoResponse(res.text);
        if (!parsed.signedData) {
            return { success: false, error: parsed.status.message || 'Podepsanou doručenku se nepodařilo získat.' };
        }
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Uložit podepsanou doručenku (právní doklad)',
            defaultPath: `dorucenka_${String(dmID).replace(/\D/g, '')}.p7s`,
            filters: [{ name: 'Podepsaná doručenka', extensions: ['p7s', 'der', 'zfo'] }]
        });
        if (!filePath) return { success: false, canceled: true };
        fs.writeFileSync(filePath, Buffer.from(parsed.signedData, 'base64'));
        return { success: true, path: filePath, events: parsed.events };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- ISDS INBOX (příchozí datové zprávy) ---
let _isdsInbox = null;
function getInbox() {
    if (!_isdsInbox) {
        _isdsInbox = new IsdsInbox({ filePath: path.join(app.getPath('userData'), 'isds_inbox.json') });
    }
    return _isdsInbox;
}

// Uloží přílohy zprávy na disk a vrátí metadata s cestami.
function saveInboxAttachments(dmID, files) {
    const dir = path.join(app.getPath('userData'), 'isds_prilohy', String(dmID).replace(/[^\w-]/g, '_'));
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    const out = [];
    for (const f of (files || [])) {
        const safe = String(f.name || 'priloha').replace(/[^\w\-. ]+/g, '_');
        const filePath = path.join(dir, safe);
        try {
            fs.writeFileSync(filePath, Buffer.from(f.base64 || '', 'base64'));
            out.push({ name: f.name, mimeType: f.mimeType, path: filePath });
        } catch (e) {
            out.push({ name: f.name, mimeType: f.mimeType, path: null });
        }
    }
    return out;
}

// Stáhne obsah jedné zprávy (SPOUŠTÍ doručení) a uloží přílohy.
async function inboxDownloadOne(creds, dmID) {
    const soapBody = isdsClient.buildMessageDownloadRequest(dmID);
    const res = await isdsCall(creds, 'messages', 'MessageDownload', soapBody);
    const parsed = isdsClient.parseMessageDownloadResponse(res.text);
    if (!parsed.status.ok) throw new Error(parsed.status.message || `Stažení selhalo (HTTP ${res.httpStatus}).`);
    const saved = saveInboxAttachments(dmID, parsed.files);
    getInbox().markDownloaded(dmID, parsed.envelope, saved);
    return { envelope: parsed.envelope, files: saved };
}

// Obnoví seznam příchozích. mode 'envelope' = jen obálky (BEZ spuštění doručení),
// 'download' = stáhne obsah nových zpráv (SPUSTÍ doručení).
ipcMain.handle('isds-inbox-refresh', async (event, mode, fromTime) => {
    try {
        const creds = readIsdsCreds();
        if (!creds || !creds.login) return { success: false, error: 'Chybí přihlašovací údaje k datové schránce.' };
        const from = fromTime || new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
        const to = new Date().toISOString();
        const soapBody = isdsClient.buildGetListOfReceivedMessagesRequest(from, to, { limit: 1000 });
        const res = await isdsCall(creds, 'info', 'GetListOfReceivedMessages', soapBody);
        const parsed = isdsClient.parseMessageListResponse(res.text);
        if (!parsed.status.ok && parsed.messages.length === 0) {
            return { success: false, error: parsed.status.message || `Načtení selhalo (HTTP ${res.httpStatus}).` };
        }
        getInbox().upsertEnvelopes(parsed.messages);
        let downloaded = 0;
        if (mode === 'download') {
            for (const it of getInbox().getNew()) {
                try { await inboxDownloadOne(creds, it.dmID); downloaded++; }
                catch (e) { console.error('Inbox auto-download error:', e.message); }
            }
        }
        return { success: true, downloaded, items: getInbox().getAll() };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('isds-inbox-list', async () => {
    try { return { success: true, items: getInbox().getAll() }; }
    catch (e) { return { success: false, error: e.message, items: [] }; }
});

// Explicitní stažení jedné zprávy (SPUSTÍ doručení) — na výslovnou akci uživatele.
ipcMain.handle('isds-inbox-download', async (event, dmID) => {
    try {
        const creds = readIsdsCreds();
        if (!creds || !creds.login) return { success: false, error: 'Chybí přihlašovací údaje k datové schránce.' };
        const r = await inboxDownloadOne(creds, dmID);
        return { success: true, files: r.files, item: getInbox().getById(dmID) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Otevře uloženou přílohu příchozí zprávy.
// BEZPEČNOST: přílohy z datové schránky mohou od kohokoli přijít jako
// spustitelné soubory (Rozsudek.pdf.exe, faktura.hta…). Přímé shell.openPath by
// je na Windows spustilo. Otevíráme jen bezpečné dokumentové typy; ostatní jen
// ukážeme ve složce, ať uživatel vidí, co to je, a nespustí to omylem.
const SAFE_OPEN_EXT = new Set([
    '.pdf', '.zfo', '.txt', '.rtf', '.odt', '.ods', '.odp',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.png', '.jpg', '.jpeg', '.gif', '.tif', '.tiff', '.bmp', '.svg',
    '.csv', '.xml', '.html', '.htm', '.eml', '.msg'
]);
ipcMain.handle('isds-inbox-open-file', async (event, filePath) => {
    try {
        const ext = path.extname(String(filePath || '')).toLowerCase();
        if (!SAFE_OPEN_EXT.has(ext)) {
            // Nebezpečný/neznámý typ — neotevírat, jen ukázat ve složce.
            try { shell.showItemInFolder(filePath); } catch (e) {}
            return { success: false, error: 'Z bezpečnostních důvodů se tento typ souboru (' + (ext || 'bez přípony') + ') neotevírá přímo. Zobrazil jsem ho ve složce k ruční kontrole.' };
        }
        await shell.openPath(filePath);
        return { success: true };
    }
    catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('isds-inbox-mark-deadline', async (event, dmID) => {
    try { getInbox().markDeadlineCreated(dmID); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

// --- DOPIS ONLINE BRIDGE (Česká pošta) ---
const postConfigPath = path.join(app.getPath('userData'), 'post_config.json');

ipcMain.handle('save-post-config', async (event, config) => {
    try {
        ensureSafeStorage();
        // Prázdné pole hesla = ponech dříve uložené (formulář ho nepředvyplňuje).
        let prev = null;
        try { if (fs.existsSync(postConfigPath)) prev = JSON.parse(fs.readFileSync(postConfigPath, 'utf-8')); } catch (e) { /* ignore */ }
        const encryptedPassword = config.password
            ? safeStorage.encryptString(config.password).toString('base64')
            : (prev && prev.password ? prev.password : safeStorage.encryptString('').toString('base64'));
        const configToSave = {
            login: config.login,
            password: encryptedPassword,
            environment: config.environment || 'production'
        };
        fs.writeFileSync(postConfigPath, JSON.stringify(configToSave, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Chyba při ukládání Post konfigurace:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-post-config', async () => {
    try {
        if (fs.existsSync(postConfigPath)) {
            const rawData = JSON.parse(fs.readFileSync(postConfigPath, 'utf-8'));
            // BEZPEČNOST: heslo se do rendereru nevrací (viz get-isds-config).
            return {
                login: rawData.login,
                hasPassword: !!rawData.password,
                environment: rawData.environment || 'production',
                hasConfig: true
            };
        }
    } catch (e) {
        console.error('Chyba při načítání Post konfigurace:', e);
    }
    return { hasConfig: false };
});

// --- ISDS CONNECTION TEST ---
ipcMain.handle('test-isds-connection', async (event, creds) => {
    try {
        // Když formulář heslo nepředal (uloženo, uživatel ho nepřepsal), doplníme
        // ho z bezpečně uloženého configu v MAIN procesu — do rendereru se
        // nevrací. Cert (pfx/passphrase) doplníme také, pokud nebyl zadán ručně.
        creds = creds || {};
        if (creds.login && !creds.pass) {
            const stored = readIsdsCreds();
            if (stored && stored.login === creds.login && stored.pass) {
                creds = Object.assign({}, creds, {
                    pass: stored.pass,
                    certPfx: creds.certPfx || stored.certPfx,
                    certPass: creds.certPass || stored.certPass
                });
            }
        }
        const soapBody = isdsClient.buildGetOwnerInfoRequest();
        const res = await isdsCall(creds, 'manage', 'GetOwnerInfoFromLogin', soapBody);
        const parsed = isdsClient.parseGetOwnerInfoResponse(res.text);
        if (parsed.dbID) {
            return { success: true, owner: parsed.firmName || parsed.dbID };
        }
        return { success: false, error: parsed.status.message || `Přihlášení selhalo (HTTP ${res.httpStatus}).` };
    } catch (error) {
        console.error('ISDS Test Error:', error);
        return { success: false, error: error.message };
    }
});

// Ověření reálné datové schránky proti ISDS (FindDataBox). Nahrazuje odhadování
// ISDS z IČO — vrací skutečnou schránku a její stav (doručitelnost).
// query = { ic?, dbID?, firmName?, dbType? }
ipcMain.handle('isds-find-databox', async (event, creds, query) => {
    try {
        creds = (creds && creds.login) ? creds : readIsdsCreds();
        if (!creds || !creds.login) return { success: false, error: 'Chybí přihlašovací údaje k datové schránce.' };
        const soapBody = isdsClient.buildFindDataBoxRequest(query || {});
        const res = await isdsCall(creds, 'search', 'FindDataBox', soapBody);
        const parsed = isdsClient.parseFindDataBoxResponse(res.text);
        if (!parsed.status.ok && parsed.boxes.length === 0) {
            return { success: false, error: parsed.status.message || `Vyhledání selhalo (HTTP ${res.httpStatus}).` };
        }
        return {
            success: true,
            boxes: parsed.boxes.map(b => ({
                ...b,
                deliverable: isdsClient.isDeliverableState(b.dbState)
            }))
        };
    } catch (error) {
        console.error('ISDS FindDataBox Error:', error);
        return { success: false, error: error.message };
    }
});

// Odeslání datové zprávy (CreateMessage).
// message = { dbIDRecipient, annotation, files: [{ name, mimeType, base64 }] }
ipcMain.handle('isds-send-message', async (event, creds, message) => {
    try {
        if (!message || !message.dbIDRecipient) {
            return { success: false, error: 'Chybí ID schránky příjemce.' };
        }
        const soapBody = isdsClient.buildCreateMessageRequest(message);
        const res = await isdsCall(creds, 'messages', 'CreateMessage', soapBody);
        const parsed = isdsClient.parseCreateMessageResponse(res.text);
        if (parsed.status.ok && parsed.dmID) {
            return { success: true, dmID: parsed.dmID, message: parsed.status.message || 'Odesláno' };
        }
        return { success: false, error: parsed.status.message || `Odeslání selhalo (HTTP ${res.httpStatus}).` };
    } catch (error) {
        console.error('ISDS Send Error:', error);
        return { success: false, error: error.message };
    }
});

// Tichý render aktuálního dokumentu do PDF (base64) — pro přílohu datové zprávy
// bez dialogu na uložení.
ipcMain.handle('render-pdf-base64', async (event, htmlContent, cssContent, headerHtml, footerHtml) => {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    try {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${cssContent || ''}
            body { margin: 0; padding: 0; background: white; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            </style></head><body>
            <div id="editor-wrapper" style="border:none; box-shadow:none; width:auto; display:flex; flex-direction:column;">
                ${headerHtml ? `<div class="page-header" id="header-area" style="padding: 10mm 20mm 5mm 20mm;">${headerHtml}</div>` : ''}
                <div class="ql-container ql-snow" style="border:none; flex-grow:1;"><div class="ql-editor">${htmlContent}</div></div>
                ${footerHtml ? `<div class="page-footer" id="footer-area" style="padding: 5mm 20mm 10mm 20mm; margin-top:auto;">${footerHtml}</div>` : ''}
            </div></body></html>`;
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
        const pdfBuffer = await printWindow.webContents.printToPDF({
            margins: { marginType: 'none' }, pageSize: 'A4', printBackground: true, landscape: false
        });
        return { success: true, base64: pdfBuffer.toString('base64') };
    } catch (e) {
        console.error('render-pdf-base64 error:', e);
        return { success: false, error: e.message };
    } finally {
        if (!printWindow.isDestroyed()) printWindow.destroy();
    }
});

// --- KALENDÁŘ (lhůty do Apple/Google/Outlook) ---
// Otevře externí URL (Google/Outlook „přidat do kalendáře") v prohlížeči.
ipcMain.handle('open-external-url', async (event, url) => {
    try {
        // Povolené jen bezpečné schéma: https (kalendář, odkazy) a mailto (otevření
        // e-mailu v systémovém poštovním klientu). shell.openExternal u mailto otevře
        // NOVÉ okno pošty s předvyplněnými poli — spolehlivěji než window.location,
        // které v Electronu externí schéma běžně neotevře.
        if (typeof url !== 'string' || !/^(https:\/\/|mailto:)/i.test(url)) {
            return { success: false, error: 'Neplatná URL.' };
        }
        await shell.openExternal(url);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Otevře NOVÉ okno pošty s předvyplněnými poli A připojenou přílohou (mailto
// přílohu neumí). macOS → Apple Mail (osascript), Windows → Outlook (PowerShell).
// Okno se jen zobrazí, neodesílá. Při jakémkoli selhání vrátí success:false —
// renderer pak spadne zpět na mailto. Vázané na Apple Mail / Outlook.
ipcMain.handle('compose-email-attach', async (event, opts) => {
    const o = opts || {};
    if (!o.to) return { success: false, error: 'Chybí příjemce.' };
    const createdTmp = []; // dočasné přílohy, které po odeslání uklidíme
    // Přílohy zadané jako base64 (např. PDF vyexportované z aktuálního dokumentu) zapíšeme
    // do temp a přidáme k attachmentPaths. Když příloha selže, pokračujeme bez ní (e-mail se
    // stejně otevře ke kontrole). Base64 nikdy nekončí v příkazové řádce — jen na disku v temp.
    try {
        if (Array.isArray(o.attachmentsB64) && o.attachmentsB64.length) {
            o.attachmentPaths = (o.attachmentPaths || []).slice();
            for (const a of o.attachmentsB64) {
                if (!a || !a.base64) continue;
                const safe = String(a.name || 'priloha.pdf').replace(/[^\w\-. ]+/g, '_');
                const tmpAtt = path.join(os.tmpdir(), `lexis_att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safe}`);
                fs.writeFileSync(tmpAtt, Buffer.from(a.base64, 'base64'));
                o.attachmentPaths.push(tmpAtt);
                createdTmp.push(tmpAtt);
            }
        }
    } catch (e) { /* příloha nepovinná — pokračuj bez ní */ }
    try {
        const { execFile } = require('child_process');
        const composeScript = require('./js/core/email-compose-script');
        const run = (cmd, args) => new Promise((resolve, reject) => {
            execFile(cmd, args, { timeout: 20000 }, (err, stdout, stderr) => {
                if (err) reject(new Error((stderr || err.message || '').toString().trim()));
                else resolve(stdout);
            });
        });
        if (process.platform === 'darwin') {
            const script = composeScript.buildAppleMailScript(o);
            await run('osascript', ['-e', script]);
            return { success: true, method: 'apple-mail' };
        }
        if (process.platform === 'win32') {
            const ps = composeScript.buildOutlookPowershell(o);
            const tmp = path.join(os.tmpdir(), `lexis_compose_${Date.now()}.ps1`);
            fs.writeFileSync(tmp, '﻿' + ps, 'utf8'); // BOM kvůli diakritice
            try {
                await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp]);
            } finally {
                try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
            }
            return { success: true, method: 'outlook' };
        }
        return { success: false, error: 'unsupported-platform' };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        // Přílohy jsme zapsali do temp; Mail/Outlook je přečte při vytvoření zprávy.
        // Uklidíme je se zpožděním (ne hned — okno pošty je může číst asynchronně).
        if (createdTmp.length) {
            const timer = setTimeout(() => {
                for (const tp of createdTmp) { try { fs.unlinkSync(tp); } catch (e) { /* ignore */ } }
            }, 60000);
            if (timer && typeof timer.unref === 'function') timer.unref();
        }
    }
});

// Uloží .ics do dočasného souboru a otevře ho v systémovém kalendáři
// (na Macu/Windows se událost přidá do výchozího kalendáře).
ipcMain.handle('calendar-open-ics', async (event, icsContent, name) => {
    try {
        const safe = String(name || 'lhuta').replace(/[^\w\-. ]+/g, '_') + '.ics';
        const filePath = path.join(app.getPath('temp'), safe);
        fs.writeFileSync(filePath, icsContent, 'utf-8');
        await shell.openPath(filePath);
        return { success: true, path: filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Uloží .ics na místo dle volby uživatele (pro import do libovolného kalendáře).
ipcMain.handle('calendar-save-ics', async (event, icsContent, name) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Uložit událost do kalendáře (.ics)',
            defaultPath: (String(name || 'lhuta').replace(/[^\w\-. ]+/g, '_')) + '.ics',
            filters: [{ name: 'Kalendář', extensions: ['ics'] }]
        });
        if (!filePath) return { success: false, canceled: true };
        fs.writeFileSync(filePath, icsContent, 'utf-8');
        return { success: true, path: filePath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Doručenka / stav zprávy (GetDeliveryInfo).
ipcMain.handle('isds-get-delivery-info', async (event, creds, dmID) => {
    try {
        const soapBody = isdsClient.buildGetDeliveryInfoRequest(dmID);
        const res = await isdsCall(creds, 'info', 'GetDeliveryInfo', soapBody);
        const parsed = isdsClient.parseGetDeliveryInfoResponse(res.text);
        if (parsed.status.ok) {
            return { success: true, dmID: parsed.dmID, events: parsed.events };
        }
        return { success: false, error: parsed.status.message || `Nelze získat doručenku (HTTP ${res.httpStatus}).` };
    } catch (error) {
        console.error('ISDS DeliveryInfo Error:', error);
        return { success: false, error: error.message };
    }
});

// --- POST CONNECTION TEST (Dopis Online) ---
ipcMain.handle('test-post-connection', async (event, creds) => {
    try {
        // Testovací vs. produkční prostředí PostServisu (Dopis Online).
        // Test: online.test.postservis.cz, produkce: online2.postservis.cz.
        const host = (creds && (creds.env === 'test' || creds.environment === 'test'))
            ? 'https://online.test.postservis.cz'
            : 'https://online2.postservis.cz';
        const url = `${host}/pds/xml/getsenders`;
        const auth = Buffer.from(`${creds.login}:${creds.pass}`).toString('base64');
            
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        if (response.status === 200) {
            return { success: true, info: 'Účet u ČP je aktivní' };
        }
        if (response.status === 401) return { success: false, error: 'Chybné klientské číslo nebo heslo' };
        return { success: false, error: `Server vrátil kód ${response.status}` };
    } catch (error) {
        console.error('Post Test Error:', error);
        return { success: false, error: error.message };
    }
});

// --- PDF IMPORT ---
ipcMain.handle('import-pdf', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Otevřít PDF v integrovaném prohlížeči',
            filters: [{ name: 'PDF Dokumenty', extensions: ['pdf'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return { success: false, canceled: true };

        const dataBuffer = fs.readFileSync(filePaths[0]);
        const base64 = dataBuffer.toString('base64');
        const data = await pdf(dataBuffer);

        return { 
            success: true, 
            text: data.text,
            info: data.info,
            pages: data.numpages,
            base64: base64
        };
    } catch (error) {
        console.error('PDF Import Error:', error);
        return { success: false, error: error.message };
    }
});

// --- ZFO IMPORT (Datové zprávy) ---
// Parsování ZFO (ASN.1/CMS → XML, tolerantní heuristika, extrakce elementů) je
// vytažené do testovaného js/core/lexis-zfo.js (viz lexisZfo.*).

ipcMain.handle('import-zfo', async (event, filePath) => {
    try {
        let selectedPath = filePath;
        if (!selectedPath) {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: 'Otevřít datovou zprávu (.zfo)',
                filters: [{ name: 'Datové zprávy', extensions: ['zfo'] }],
                properties: ['openFile']
            });

            if (canceled || filePaths.length === 0) return { success: false, canceled: true };
            selectedPath = filePaths[0];
        }

        const zfoBuffer = fs.readFileSync(selectedPath);

        // Korektní extrakce XML z PKCS#7/CMS kontejneru přes node-forge (viz extractZfoXml).
        const xmlContent = lexisZfo.extractZfoXml(zfoBuffer);
        if (!xmlContent) {
            throw new Error('Nepodařilo se extrahovat obsah datové zprávy ze ZFO (neplatný nebo nepodporovaný formát).');
        }

        // Metadata (tolerantní k namespace prefixům).
        const sender = lexisZfo.zfoTagValue(xmlContent, 'dmSender');
        const senderId = lexisZfo.zfoTagValue(xmlContent, 'dbIDSender');
        const subject = lexisZfo.zfoTagValue(xmlContent, 'dmAnnotation');

        // Přílohy: dmFileDescr může být ELEMENT i ATRIBUT (reálný ISDS formát),
        // dmEncodedContent je víceřádkový base64.
        const attachments = [];
        const fileRe = /<(?:[\w-]+:)?dmFile\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?dmFile>/g;
        let fm;
        while ((fm = fileRe.exec(xmlContent)) !== null) {
            const attrs = fm[1] || '';
            const inner = fm[2] || '';
            const descrAttr = attrs.match(/dmFileDescr\s*=\s*"([^"]*)"/i);
            const name = (descrAttr ? descrAttr[1] : lexisZfo.zfoTagValue(inner, 'dmFileDescr')) || 'priloha';
            const content = lexisZfo.zfoTagValue(inner, 'dmEncodedContent');
            if (content) {
                attachments.push({
                    name,
                    content, // base64
                    type: name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'other'
                });
            }
        }

        return {
            success: true,
            xml: xmlContent,
            sender: sender || 'Neznámý odesílatel',
            senderId: senderId || '',
            subject: subject || 'Bez předmětu',
            attachments
        };
    } catch (error) {
        console.error('ZFO Import Error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('import-pdf-base64', async (event, base64) => {
    try {
        const dataBuffer = Buffer.from(base64, 'base64');
        const data = await pdf(dataBuffer);
        return { success: true, text: data.text, pages: data.numpages };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// --- AI CONFIG BRIDGE ---
const aiConfigPath = path.join(app.getPath('userData'), 'ai_config.json');

ipcMain.handle('save-ai-config', async (event, config) => {
    try {
        let encryptedKey = '';
        if (config.apiKey) {
            ensureSafeStorage();
            encryptedKey = safeStorage.encryptString(config.apiKey).toString('base64');
        }
        const configToSave = {
            provider: config.provider,
            model: config.model,
            endpoint: config.endpoint,
            apiKey: encryptedKey
        };
        fs.writeFileSync(aiConfigPath, JSON.stringify(configToSave, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Chyba při ukládání AI konfigurace:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-ai-config', async () => {
    try {
        if (fs.existsSync(aiConfigPath)) {
            const rawData = JSON.parse(fs.readFileSync(aiConfigPath, 'utf-8'));
            let decryptedKey = '';
            if (rawData.apiKey) {
                decryptedKey = safeStorage.decryptString(Buffer.from(rawData.apiKey, 'base64'));
            }
            return {
                provider: rawData.provider,
                model: rawData.model,
                endpoint: rawData.endpoint,
                apiKey: decryptedKey,
                hasConfig: true
            };
        }
    } catch (e) {
        console.error('Chyba při načítání AI konfigurace:', e);
    }
    return { hasConfig: false };
});

// --- LEXISLINK SERVER (v3.0 Office Mode) ---
// Bezpečnost: server běží v LAN (telefon ↔ PC), proto NENÍ vázán na 127.0.0.1,
// ale každý požadavek musí nést párovací token generovaný při startu.
// Token se předává v QR kódu (url) a tím i do /remote stránky.
let lexisLinkServer = null;
let lexisLinkToken = null;
const LEXIS_LINK_PORT = 3300;
const LEXIS_LINK_MAX_BODY = 25 * 1024 * 1024; // 25 MB strop pro upload

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Zastavení serveru (a zneplatnění tokenu).
ipcMain.handle('stop-lexis-link', async () => {
    if (lexisLinkServer) {
        try { lexisLinkServer.close(); } catch (e) {}
        lexisLinkServer = null;
        lexisLinkToken = null;
    }
    return { success: true };
});

ipcMain.handle('start-lexis-link', async () => {
    const ip = getLocalIp();
    if (lexisLinkServer) {
        return {
            success: true,
            url: 'http://' + ip + ':' + LEXIS_LINK_PORT + '/remote?token=' + lexisLinkToken,
            token: lexisLinkToken
        };
    }

    // Nový silný párovací token pro tuto relaci.
    lexisLinkToken = lexisLinkSec.generateToken();

    function applyCors(req, res) {
        const origin = req.headers.origin;
        if (origin && lexisLinkSec.isKnownOrigin(origin, LEXIS_LINK_PORT, ip)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    function requireToken(req, res, parsedUrl) {
        if (lexisLinkSec.isValidToken(req, parsedUrl, lexisLinkToken)) return true;
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Neautorizováno' }));
        return false;
    }

    // Přečte tělo requestu s tvrdým stropem velikosti (obrana proti DoS).
    function readBody(req, res, onData) {
        let body = '';
        let aborted = false;
        req.on('data', chunk => {
            if (aborted) return;
            body += chunk.toString();
            if (body.length > LEXIS_LINK_MAX_BODY) {
                aborted = true;
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Data jsou příliš velká.' }));
                req.destroy();
            }
        });
        req.on('end', () => { if (!aborted) onData(body); });
    }

    lexisLinkServer = http.createServer((req, res) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        } catch (e) {
            res.writeHead(400); res.end(); return;
        }
        const pathName = parsedUrl.pathname;

        if (req.method === 'OPTIONS') {
            applyCors(req, res);
            res.writeHead(204);
            res.end();
            return;
        }

        if (pathName === '/remote') {
            // I samotná ovládací stránka vyžaduje platný token, jinak by ji
            // načetl kdokoli v síti a získal funkční tlačítka.
            if (!lexisLinkSec.isValidToken(req, parsedUrl, lexisLinkToken)) {
                res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<!DOCTYPE html><meta charset="utf-8"><h2>401 – Neautorizováno</h2><p>Otevřete LexisLink naskenováním QR kódu přímo z aplikace LexisEditor.</p>');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            const remoteHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>LexisLink Remote</title>
                    <style>
                        body { font-family: sans-serif; background: #f8fafc; display: flex; flex-direction: column; align-items: center; padding: 20px; }
                        .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 300px; text-align: center; }
                        button { width: 100%; padding: 15px; margin: 10px 0; border: none; border-radius: 8px; background: #0078d4; color: white; font-weight: bold; cursor: pointer; }
                        .status { font-size: 12px; color: #64748b; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2 style="color:#0078d4">🤖 LexisLink</h2>
                        <p style="font-size:14px; color:#64748b">Vzdálené ovládání AI Agenta</p>
                        <button onclick="sendCommand('summarize')">✨ Shrnot dokument</button>
                        <button onclick="sendCommand('logic')">🧠 Kontrola logiky</button>
                        <button onclick="document.getElementById('camera-input').click()" style="background:#16a34a">📸 Skenovat dokument</button>
                        <input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none" onchange="uploadImage(this)">
                    </div>
                    <div class="status" id="status">Připojeno k LexisEditoru</div>
                    <script>
                        const TOKEN = ${JSON.stringify(lexisLinkToken)};
                        function authHeaders(extra) { return Object.assign({ 'Authorization': 'Bearer ' + TOKEN }, extra || {}); }
                        function sendCommand(cmd) {
                            document.getElementById('status').innerText = 'Odesílám: ' + cmd;
                            fetch('/api/command?cmd=' + encodeURIComponent(cmd), { method: 'POST', headers: authHeaders() })
                                .then(r => r.json())
                                .then(data => {
                                    document.getElementById('status').innerText = 'Hotovo: ' + (data.success ? 'OK' : 'Chyba');
                                })
                                .catch(err => {
                                    console.error(err);
                                    document.getElementById('status').innerText = 'Chyba spojení';
                                });
                        }
                        function uploadImage(input) {
                            if (!input.files || !input.files[0]) return;
                            document.getElementById('status').innerText = 'Nahrávám sken...';
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                fetch('/api/upload', {
                                    method: 'POST',
                                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                                    body: JSON.stringify({ image: e.target.result })
                                })
                                .then(r => r.json())
                                .then(data => {
                                    document.getElementById('status').innerText = 'Sken odeslán do PC';
                                })
                                .catch(err => {
                                    console.error(err);
                                    document.getElementById('status').innerText = 'Chyba při nahrávání';
                                });
                            };
                            reader.readAsDataURL(input.files[0]);
                        }
                    <\/script>
                </body>
                </html>
            `;
            res.end(remoteHtml);
        } else if (pathName === '/api/command') {
            applyCors(req, res);
            // BEZPEČNOST: jen POST (ne GET), token, a příkaz z pevného allow-listu —
            // ať přes LAN nejde poslat libovolný příkaz do rendereru.
            if (req.method !== 'POST') {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
                return;
            }
            if (!requireToken(req, res, parsedUrl)) return;
            const cmd = parsedUrl.searchParams.get('cmd');
            const ALLOWED_CMDS = ['summarize', 'logic'];
            if (!ALLOWED_CMDS.includes(cmd)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Neznámý příkaz' }));
                return;
            }
            if (mainWindow) {
                mainWindow.webContents.send('lexis-link-command', cmd);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else if (pathName === '/api/import' && req.method === 'POST') {
            applyCors(req, res);
            if (!requireToken(req, res, parsedUrl)) return;
            readBody(req, res, (body) => {
                try {
                    const data = JSON.parse(body);
                    if (mainWindow) {
                        mainWindow.webContents.send('lexis-connect-import', data);
                        mainWindow.show();
                        mainWindow.focus();
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Dokument byl importován do LexisEditoru.' }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Neplatný JSON' }));
                }
            });
        } else if (pathName === '/api/upload' && req.method === 'POST') {
            applyCors(req, res);
            if (!requireToken(req, res, parsedUrl)) return;
            readBody(req, res, (body) => {
                try {
                    const data = JSON.parse(body);
                    if (mainWindow && data.image) {
                        mainWindow.webContents.send('lexis-link-scan', data.image);
                        mainWindow.show();
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    // Bind s ošetřením chyb (obsazený port apod.) — úspěch se hlásí až po bindu.
    return await new Promise((resolve) => {
        const onError = (err) => {
            console.error('LexisLink server error:', err);
            lexisLinkServer = null;
            lexisLinkToken = null;
            resolve({
                success: false,
                error: err && err.code === 'EADDRINUSE'
                    ? 'Port ' + LEXIS_LINK_PORT + ' je již obsazený jinou aplikací.'
                    : (err ? err.message : 'Nepodařilo se spustit LexisLink server.')
            });
        };
        lexisLinkServer.once('error', onError);
        lexisLinkServer.listen(LEXIS_LINK_PORT, () => {
            lexisLinkServer.removeListener('error', onError);
            // Za běhu logujeme případné pozdější chyby, ale neshazujeme proces.
            lexisLinkServer.on('error', (e) => console.error('LexisLink runtime error:', e));
            resolve({
                success: true,
                url: 'http://' + ip + ':' + LEXIS_LINK_PORT + '/remote?token=' + lexisLinkToken,
                token: lexisLinkToken
            });
        });
    });
});

// IPC Handler pro vyhledávání soudních jednání (InfoJednání)
ipcMain.handle('query-infojednani', async (event, queryParams) => {
    try {
        const response = await fetch('https://infojednani.gov.cz/api/v1/jednani/vyhledej', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(queryParams)
        });
        if (!response.ok) {
            throw new Error(`Chyba InfoJednání API: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error('Chyba při volání InfoJednání:', error);
        return { success: false, error: error.message };
    }
});

// ============================================================
//   SECURITY LOCK — Zabezpečení aplikace (Touch ID / heslo)
// ============================================================

const lockConfigPath = path.join(app.getPath('userData'), 'lexis_lock.json');

// Uložení nastavení zámku (enable/disable + jednosměrně hašované heslo)
// Heslo se ukládá jako scrypt hash se solí — NELZE ho zpětně dešifrovat.
// Deleguje na testovaný js/core/lexis-lock.js (formát zachován beze změny).
function hashPasswordScrypt(password) {
    return lexisLock.hashPassword(password);
}

ipcMain.handle('lock-save-config', async (event, config) => {
    try {
        let existing = {};
        if (fs.existsSync(lockConfigPath)) {
            try { existing = JSON.parse(fs.readFileSync(lockConfigPath, 'utf-8')); } catch (e) {}
        }
        // Minimální délka hesla se vynucuje i v main procesu (ne jen v rendereru,
        // který jde obejít). Prázdné heslo je OK jen když už nějaké existuje
        // (uživatel jen mění jiná nastavení) nebo když se zámek zakládá bez hesla
        // (např. jen Touch ID).
        const MIN_LEN = 8;
        if (config.password && String(config.password).length < MIN_LEN) {
            return { success: false, error: `Heslo musí mít alespoň ${MIN_LEN} znaků.` };
        }
        const toSave = {
            enabled: !!config.enabled,
            method: config.method || 'password', // 'touchid' | 'password' | 'both'
            touchIdEnabled: !!config.touchIdEnabled,
        };
        if (config.password) {
            toSave.passwordScrypt = hashPasswordScrypt(config.password);
        } else if (existing.passwordScrypt) {
            // Ponechat existující scrypt hash.
            toSave.passwordScrypt = existing.passwordScrypt;
        } else if (existing.passwordHash) {
            // Ponechat starý (legacy) hash — migruje se při příštím ověření.
            toSave.passwordHash = existing.passwordHash;
        }
        fs.writeFileSync(lockConfigPath, JSON.stringify(toSave, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Chyba při ukládání lock konfigurace:', e);
        return { success: false, error: e.message };
    }
});

// Načtení nastavení zámku (bez hesla — pouze enabled + method)
ipcMain.handle('lock-get-config', async () => {
    try {
        if (fs.existsSync(lockConfigPath)) {
            const raw = JSON.parse(fs.readFileSync(lockConfigPath, 'utf-8'));
            // Nikdy neposílat heslo zpět do rendereru
            return {
                enabled: !!raw.enabled,
                method: raw.method || 'password',
                touchIdEnabled: !!raw.touchIdEnabled,
                hasPassword: !!(raw.passwordScrypt || raw.passwordHash)
            };
        }
    } catch (e) {
        console.error('Chyba při čtení lock konfigurace:', e);
    }
    return { enabled: false, method: 'password', touchIdEnabled: false, hasPassword: false };
});

// Smazání lock konfigurace (vypnutí zámku)
ipcMain.handle('lock-delete-config', async () => {
    try {
        if (fs.existsSync(lockConfigPath)) fs.unlinkSync(lockConfigPath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Ověření hesla (scrypt v konstantním čase; legacy hash se migruje na scrypt)
ipcMain.handle('lock-verify-password', async (event, inputPassword) => {
    try {
        if (!fs.existsSync(lockConfigPath)) return { success: false, error: 'Žádná konfigurace.' };
        const raw = JSON.parse(fs.readFileSync(lockConfigPath, 'utf-8'));

        // Preferovaná cesta: scrypt hash se solí, porovnání v konstantním čase.
        if (raw.passwordScrypt && raw.passwordScrypt.salt && raw.passwordScrypt.hash) {
            return { success: lexisLock.verifyPassword(raw.passwordScrypt, inputPassword) };
        }

        // Legacy (reverzibilní safeStorage) — ověř a rovnou upgraduj na scrypt.
        if (raw.passwordHash) {
            let stored = '';
            try {
                stored = safeStorage.decryptString(Buffer.from(raw.passwordHash, 'base64'));
            } catch (e) {
                return { success: false, error: 'Uložené heslo nelze ověřit na tomto zařízení.' };
            }
            const ok = lexisLinkSec.timingSafeEqualStr(stored, inputPassword || '');
            if (ok) {
                try {
                    raw.passwordScrypt = hashPasswordScrypt(inputPassword);
                    delete raw.passwordHash;
                    fs.writeFileSync(lockConfigPath, JSON.stringify(raw, null, 2), 'utf-8');
                } catch (e) { /* migrace je best-effort */ }
            }
            return { success: ok };
        }

        return { success: false, error: 'Heslo není nastaveno.' };
    } catch (e) {
        console.error('Chyba při ověřování hesla:', e);
        return { success: false, error: e.message };
    }
});

// Touch ID dostupnost
ipcMain.handle('lock-touchid-available', async () => {
    if (process.platform === 'darwin') {
        try {
            return { available: systemPreferences.canPromptTouchID() };
        } catch (e) {
            return { available: false };
        }
    } else if (process.platform === 'win32') {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            const checkScript = `
                [Void][System.Reflection.Assembly]::LoadWithPartialName("System.Runtime.WindowsRuntime")
                try {
                    $avail = [Windows.Security.Credentials.UI.UserConsentVerifier]::GetAvailabilityAsync().GetAwaiter().GetResult()
                    if ($avail -eq "Available") {
                        Write-Output "AVAILABLE"
                    } else {
                        Write-Output "UNAVAILABLE"
                    }
                } catch {
                    Write-Output "UNAVAILABLE"
                }
            `.trim();
            
            const tempCheckPath = path.join(app.getPath('temp'), 'check_hello.ps1');
            fs.writeFileSync(tempCheckPath, checkScript, 'utf-8');
            
            exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempCheckPath}"`, (error, stdout) => {
                try { fs.unlinkSync(tempCheckPath); } catch(e) {}
                if (error) {
                    resolve({ available: false });
                } else {
                    resolve({ available: stdout.trim() === "AVAILABLE" });
                }
            });
        });
    }
    return { available: false };
});
