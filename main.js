const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const HTMLToDOCX = require('html-to-docx');

let mainWindow;

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
});

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
