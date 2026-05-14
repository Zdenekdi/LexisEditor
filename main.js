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
