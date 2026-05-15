const { app, BrowserWindow, ipcMain, dialog, safeStorage, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const HTMLToDOCX = require('html-to-docx');
const axios = null; // Removed in favor of native fetch
const pdf = require('pdf-parse');
const forge = require('node-forge');

let mainWindow;

// --- BIOMETRIC / TOUCH ID SUPPORT ---
ipcMain.handle('authenticate-biometric', async (event, reason) => {
    if (process.platform !== 'darwin') return { success: false, error: 'Biometrika je dostupná pouze na macOS.' };
    
    try {
        if (!systemPreferences.canPromptTouchID()) {
            return { success: false, error: 'Touch ID není na tomto zařízení dostupné nebo nastavené.' };
        }
        
        await systemPreferences.promptTouchID(reason || 'Ověření pro přístup k zabezpečeným údajům');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
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
}

app.setName('LexisEditor');

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

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
ipcMain.handle('export-docx', async (event, htmlContent) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Uložit dokument',
            defaultPath: 'Dokument_LexisEditor.docx',
            filters: [
                { name: 'Word Dokument', extensions: ['docx'] }
            ]
        });

        if (filePath) {
            // Konverze HTML (z Quill editoru) do čistého DOCX bufferu
            const fileBuffer = await HTMLToDOCX(htmlContent, null, {
                table: { row: { cantSplit: true } },
                footer: true,
                pageNumber: true,
            });
            
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
    try {
        // Nové REST API Ministerstva financí
        const response = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`);
        if (!response.ok) {
            throw new Error(`Chyba ARES API: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        
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
        return { success: false, error: error.message };
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
        currentTemplates[type] = content;
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

ipcMain.handle('export-bundle', async (event, htmlContent, cssContent) => {
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

            // 1. Export DOCX
            const docxBuffer = await HTMLToDOCX(htmlContent, null, {
                table: { row: { cantSplit: true } },
                footer: true,
                pageNumber: true,
            });
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
                        .ql-editor { padding: 20mm 25mm !important; }
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <div class="ql-container ql-snow" style="border:none;">
                        <div class="ql-editor">${htmlContent}</div>
                    </div>
                </body>
                </html>
            `;
            
            await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
            
            const pdfBuffer = await printWindow.webContents.printToPDF({
                marginsType: 1, // No margins (handled by CSS)
                pageSize: 'A4',
                printBackground: true,
                landscape: false
            });
            
            fs.writeFileSync(pdfPath, pdfBuffer);
            printWindow.destroy();

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
        const encryptedPassword = safeStorage.encryptString(config.password);
        const configToSave = {
            login: config.login,
            password: encryptedPassword.toString('base64'),
            environment: config.environment || 'production'
        };
        fs.writeFileSync(isdsConfigPath, JSON.stringify(configToSave, null, 2), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Chyba při ukládání ISDS konfigurace:', e);
        return { success: false, error: e.message };
    }
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
                hasConfig: true
            };
        }
    } catch (e) {
        console.error('Chyba při načítání ISDS konfigurace:', e);
    }
    return { hasConfig: false };
});

// --- DOPIS ONLINE BRIDGE (Česká pošta) ---
const postConfigPath = path.join(app.getPath('userData'), 'post_config.json');

ipcMain.handle('save-post-config', async (event, config) => {
    try {
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
        const url = creds.env === 'production' 
            ? 'https://www.mojedatovaschranka.cz/asws/ds' 
            : 'https://ws.mojedatovaschranka.cz/asws/ds';
            
        const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:isds="http://isds.czechpoint.cz/v20">
  <soap:Body>
    <isds:GetOwnerInfoFromLogin/>
  </soap:Body>
</soap:Envelope>`;

        const auth = Buffer.from(`${creds.login}:${creds.pass}`).toString('base64');
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'Authorization': `Basic ${auth}`
            },
            body: soapRequest
        });

        const data = await response.text();

        if (data.includes('dbID')) {
            const nameMatch = data.match(/<dbName>(.*?)<\/dbName>/);
            return { success: true, owner: nameMatch ? nameMatch[1] : 'Ověřeno' };
        } else if (data.includes('dmErrMessage')) {
            const errMsg = data.match(/<dmErrMessage>(.*?)<\/dmErrMessage>/);
            return { success: false, error: errMsg ? errMsg[1] : 'Chyba přihlášení' };
        }
        
        return { success: false, error: 'Neočekávaná odpověď serveru' };
    } catch (error) {
        console.error('ISDS Test Error:', error);
        return { success: false, error: error.message };
    }
});

// --- POST CONNECTION TEST (Dopis Online) ---
ipcMain.handle('test-post-connection', async (event, creds) => {
    try {
        const url = 'https://online2.postservis.cz/pds/xml/getsenders';
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
            title: 'Importovat text z PDF',
            filters: [{ name: 'PDF Dokumenty', extensions: ['pdf'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return { success: false, canceled: true };

        const dataBuffer = fs.readFileSync(filePaths[0]);
        const data = await pdf(dataBuffer);

        return { 
            success: true, 
            text: data.text,
            info: data.info,
            pages: data.numpages
        };
    } catch (error) {
        console.error('PDF Import Error:', error);
        return { success: false, error: error.message };
    }
});

// --- ZFO IMPORT (Datové zprávy) ---
ipcMain.handle('import-zfo', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Otevřít datovou zprávu (.zfo)',
            filters: [{ name: 'Datové zprávy', extensions: ['zfo'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return { success: false, canceled: true };

        const zfoBuffer = fs.readFileSync(filePaths[0]);
        const zfoContent = zfoBuffer.toString('binary');
        
        // ZFO je PKCS#7 (CMS) kontejner. Pro jednoduchou extrakci obsahu (XML)
        // se pokusíme najít začátek XML struktury.
        // V produkční verzi by se mělo použít node-forge pro korektní CMS parsing.
        
        let xmlContent = '';
        const startTag = '<dmMessage';
        const endTag = '</dmMessage>';
        const startIndex = zfoContent.indexOf(startTag);
        const endIndex = zfoContent.indexOf(endTag);
        
        if (startIndex !== -1 && endIndex !== -1) {
            xmlContent = zfoContent.substring(startIndex, endIndex + endTag.length);
        } else {
            // Zkusíme hledat obecnější <root> pokud dmMessage není hlavní
            const altStart = '<?xml';
            const altStartIndex = zfoContent.indexOf(altStart);
            if (altStartIndex !== -1) {
                xmlContent = zfoContent.substring(altStartIndex);
            }
        }

        if (!xmlContent) throw new Error('Nepodařilo se extrahovat XML obsah ze ZFO souboru.');

        // Extrakce základních metadat (jednoduchý regex pro demo/v3.5)
        const senderMatch = xmlContent.match(/<dmSender>(.*?)<\/dmSender>/);
        const senderIdMatch = xmlContent.match(/<dbIDSender>(.*?)<\/dbIDSender>/);
        const subjectMatch = xmlContent.match(/<dmAnnotation>(.*?)<\/dmAnnotation>/);
        
        // Extrakce příloh (jednoduchá verze pro demo)
        const attachments = [];
        const fileRegex = /<dmFile>([\s\S]*?)<\/dmFile>/g;
        let fileMatch;
        while ((fileMatch = fileRegex.exec(xmlContent)) !== null) {
            const fileXml = fileMatch[1];
            const nameMatch = fileXml.match(/<dmFileDescr>(.*?)<\/dmFileDescr>/);
            const contentMatch = fileXml.match(/<dmEncodedContent>(.*?)<\/dmEncodedContent>/);
            if (nameMatch && contentMatch) {
                attachments.push({
                    name: nameMatch[1],
                    content: contentMatch[1], // Base64
                    type: nameMatch[1].toLowerCase().endsWith('.pdf') ? 'pdf' : 'other'
                });
            }
        }

        return { 
            success: true, 
            xml: xmlContent,
            sender: senderMatch ? senderMatch[1] : 'Neznámý odesílatel',
            senderId: senderIdMatch ? senderIdMatch[1] : '',
            subject: subjectMatch ? subjectMatch[1] : 'Bez předmětu',
            attachments: attachments
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
let lexisLinkServer = null;
const LEXIS_LINK_PORT = 3300;

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

ipcMain.handle('start-lexis-link', async () => {
    if (lexisLinkServer) return { success: true, url: `http://${getLocalIp()}:${LEXIS_LINK_PORT}/remote` };

    lexisLinkServer = http.createServer((req, res) => {
        if (req.url === '/remote') {
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
                        <button onclick="sendCommand('research')">📚 Právní rešerše</button>
                    </div>
                    <div class="status" id="status">Připojeno k LexisEditoru</div>
                    <script>
                        function sendCommand(cmd) {
                            document.getElementById('status').innerText = 'Odesílám: ' + cmd;
                            fetch('/api/command?cmd=' + cmd, { method: 'POST' })
                                .then(r => r.json())
                                .then(data => {
                                    document.getElementById('status').innerText = 'Hotovo: ' + (data.success ? 'OK' : 'Chyba');
                                });
                        }
                    <\/script>
                </body>
                </html>
            `;
            res.end(remoteHtml);
        } else if (req.url.startsWith('/api/command')) {
            const url = new URL(req.url, \`http://\${req.headers.host}\`);
            const cmd = url.searchParams.get('cmd');
            
            if (mainWindow) {
                mainWindow.webContents.send('lexis-link-command', cmd);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    lexisLinkServer.listen(LEXIS_LINK_PORT);
    return { success: true, url: \`http://\${getLocalIp()}:\${LEXIS_LINK_PORT}/remote\` };
});
