const { app, BrowserWindow, ipcMain, dialog, safeStorage, systemPreferences, shell } = require('electron');
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
const isdsClient = require('./js/core/isds-client.js');
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
    const env = (creds && creds.env === 'production') ? 'production' : 'test';
    const useCert = !!(creds && (creds.certPfx || (creds.certPem && creds.keyPem)));
    const override = (creds && (creds.host || creds.basePath)) ? { host: creds.host, basePath: creds.basePath } : null;
    const url = isdsClient.buildEndpoint(env, service, override, useCert);

    const headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': isdsClient.soapAction(operation)
    };
    // Login certificate = jméno+heslo + klientský cert; jméno/heslo je i u běžného přístupu.
    if (creds && creds.login) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${creds.login}:${creds.pass || ''}`).toString('base64');
    }

    if (useCert) {
        const tls = creds.certPfx
            ? { pfx: creds.certPfx, passphrase: creds.certPass || undefined }
            : { cert: creds.certPem, key: creds.keyPem, passphrase: creds.certPass || undefined };
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
}

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

app.whenReady().then(() => {
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

// Start aplikace
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

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
            const fileBuffer = await HTMLToDOCX(htmlContent, headerHtml || null, {
                table: { row: { cantSplit: true } },
                header: !!headerHtml,
                footer: !!footerHtml,
                pageNumber: true,
            }, footerHtml || null);
            
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
    kupni: { title: "Kupní smlouva", desc: "Šablona nemovitosti/věci movité", icon: "🤝", content: '<h1 class="ql-align-center">KUPNÍ SMLOUVA</h1><p><br></p><p>uzavřená ve smyslu ust. § 2079 a násl. zákona č. 89/2012 Sb., občanský zákoník</p><p><br></p><p><strong>I. Smluvní strany</strong></p><p>Prodávající: [JMÉNO]</p><p>Kupující: [JMÉNO]</p><p><br></p><p><strong>II. Předmět koupě</strong></p><p>Předmětem této smlouvy je...</p>' },
    plnamoc: { title: "Plná moc", desc: "Zastoupení advokátem ve věci", icon: "✍️", content: '<h1 class="ql-align-center">PLNÁ MOC</h1><p><br></p><p>Já, níže podepsaný/á [JMÉNO/NÁZEV], r.č./IČO: [HODNOTA], bytem/sídlem [ADRESA]</p><p><br></p><p><strong>zmocňuji tímto</strong></p><p><br></p><p>advokáta Mgr. Jana Nováka, ev. č. ČAK 12345, sídlem Advokátní 123, 110 00 Praha 1, aby mě zastupoval ve všech právních věcech a činech...</p>' },
    zaloba: { title: "Žaloba (Návrh)", desc: "Občanské soudní řízení", icon: "⚖️", content: '<h1 class="ql-align-center">ŽALOBA NA PLNĚNÍ</h1><p><br></p><p><strong>Okresnímu soudu v [MĚSTO]</strong></p><p>Ke sp. zn.: [SPIS_ZNACKA]</p><p><br></p><p><strong>Žalobce:</strong> [JMÉNO]</p><p><strong>Žalovaný:</strong> [JMÉNO]</p><p><br></p><p><strong>O zaplacení částky [ČÁSTKA] s příslušenstvím</strong></p><p><br></p><p>I.</p><p>Žalobce a žalovaný uzavřeli dne [DATUM] smlouvu...</p>' },
    hlavicka: { title: "Hlavičkový papír", desc: "Firemní vizuál kanceláře", icon: "📝", content: '<div style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px;"><h2 style="margin: 0; color: #1e293b;">Advokátní kancelář Lexis</h2><p style="margin: 0; font-size: 12px; color: #64748b;">Právní 123, 110 00 Praha 1 | IČO: 12345678</p></div><p><br></p>' }
};

ipcMain.handle('get-templates', () => {
    try {
        if (fs.existsSync(templatesPath)) {
            const rawData = fs.readFileSync(templatesPath, 'utf-8');
            return JSON.parse(rawData);
        }
    } catch (e) {
        console.error('Chyba při čtení šablon:', e);
    }
    return defaultTemplates;
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
            const docxBuffer = await HTMLToDOCX(htmlContent, headerHtml || null, {
                table: { row: { cantSplit: true } },
                header: !!headerHtml,
                footer: !!footerHtml,
                pageNumber: true,
            }, footerHtml || null);
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
        const encryptedPassword = safeStorage.encryptString(config.password || '');
        const configToSave = {
            login: config.login,
            password: encryptedPassword.toString('base64'),
            environment: config.environment || 'production'
        };
        // Volitelné přihlášení klientským certifikátem (.p12/.pfx). Heslo k certifikátu
        // se šifruje stejně jako heslo k datovce; cesta k souboru se ukládá jako reference.
        if (config.certPath) configToSave.certPath = config.certPath;
        if (config.certPassphrase) {
            configToSave.certPassphrase = safeStorage.encryptString(config.certPassphrase).toString('base64');
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
            // Dešifrování hesla zpět pro použití v API
            const decryptedPassword = safeStorage.decryptString(Buffer.from(rawData.password, 'base64'));
            return {
                login: rawData.login,
                password: decryptedPassword,
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
ipcMain.handle('isds-inbox-open-file', async (event, filePath) => {
    try { await shell.openPath(filePath); return { success: true }; }
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
        const encryptedPassword = safeStorage.encryptString(config.password);
        const configToSave = {
            login: config.login,
            password: encryptedPassword.toString('base64'),
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
            const decryptedPassword = safeStorage.decryptString(Buffer.from(rawData.password, 'base64'));
            return {
                login: rawData.login,
                password: decryptedPassword,
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
        if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
            return { success: false, error: 'Neplatná URL.' };
        }
        await shell.openExternal(url);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
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
// Rekurzivně posbírá řetězcové hodnoty listů z ASN.1 stromu (pro nalezení XML v CMS).
function collectAsn1Strings(node, out) {
    if (!node || typeof node !== 'object' || out.length > 5000) return;
    if (typeof node.value === 'string') {
        out.push(node.value);
    } else if (Array.isArray(node.value)) {
        for (const child of node.value) collectAsn1Strings(child, out);
    }
}

// Vytáhne XML datové zprávy ze ZFO. ZFO je PKCS#7 / CMS (DER) — korektně ho
// rozparsujeme přes node-forge a najdeme zapouzdřený obsah (eContent) s XML.
// Když soubor není platný DER (netypický/nepodepsaný export), spadneme na heuristiku.
// Vše je tolerantní k namespace prefixům (např. <p:dmMessage>).
function extractZfoXml(zfoBuffer) {
    const hasMsg = (s) => /<(?:[\w-]+:)?dmMessage[\s>]/.test(s) || /<\?xml/.test(s);
    // 1) Korektní CMS/DER cesta.
    try {
        const der = forge.util.createBuffer(zfoBuffer.toString('binary'));
        const asn1 = forge.asn1.fromDer(der);
        const leaves = [];
        collectAsn1Strings(asn1, leaves);
        for (const raw of leaves) {
            if (!raw || raw.length < 20) continue;
            let utf8 = raw;
            try { utf8 = forge.util.decodeUtf8(raw); } catch (e) {}
            if (hasMsg(utf8)) return utf8;
            if (hasMsg(raw)) return raw;
        }
    } catch (e) { /* není platný DER → heuristika níže */ }

    // 2) Heuristika pro netypické/nepodepsané soubory.
    const bin = zfoBuffer.toString('binary');
    const m = bin.match(/<(?:[\w-]+:)?dmMessage[\s>][\s\S]*?<\/(?:[\w-]+:)?dmMessage>/);
    if (m) return m[0];
    const x = bin.indexOf('<?xml');
    if (x !== -1) return bin.slice(x);
    return '';
}

// Namespace-tolerantní hodnota elementu.
function zfoTagValue(xml, tag) {
    const m = xml.match(new RegExp('<(?:[\\w-]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + tag + '>'));
    return m ? m[1].trim() : '';
}

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
        const xmlContent = extractZfoXml(zfoBuffer);
        if (!xmlContent) {
            throw new Error('Nepodařilo se extrahovat obsah datové zprávy ze ZFO (neplatný nebo nepodporovaný formát).');
        }

        // Metadata (tolerantní k namespace prefixům).
        const sender = zfoTagValue(xmlContent, 'dmSender');
        const senderId = zfoTagValue(xmlContent, 'dbIDSender');
        const subject = zfoTagValue(xmlContent, 'dmAnnotation');

        // Přílohy: dmFileDescr může být ELEMENT i ATRIBUT (reálný ISDS formát),
        // dmEncodedContent je víceřádkový base64.
        const attachments = [];
        const fileRe = /<(?:[\w-]+:)?dmFile\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?dmFile>/g;
        let fm;
        while ((fm = fileRe.exec(xmlContent)) !== null) {
            const attrs = fm[1] || '';
            const inner = fm[2] || '';
            const descrAttr = attrs.match(/dmFileDescr\s*=\s*"([^"]*)"/i);
            const name = (descrAttr ? descrAttr[1] : zfoTagValue(inner, 'dmFileDescr')) || 'priloha';
            const content = zfoTagValue(inner, 'dmEncodedContent');
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
            if (!requireToken(req, res, parsedUrl)) return;
            const cmd = parsedUrl.searchParams.get('cmd');
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
function hashPasswordScrypt(password) {
    const salt = crypto.randomBytes(16);
    const keylen = 64;
    const derived = crypto.scryptSync(password, salt, keylen);
    return { salt: salt.toString('hex'), hash: derived.toString('hex'), keylen };
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
            const salt = Buffer.from(raw.passwordScrypt.salt, 'hex');
            const keylen = raw.passwordScrypt.keylen || 64;
            const derived = crypto.scryptSync(inputPassword || '', salt, keylen);
            const stored = Buffer.from(raw.passwordScrypt.hash, 'hex');
            const ok = derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
            return { success: ok };
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
