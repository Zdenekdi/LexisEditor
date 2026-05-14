const { contextBridge, ipcRenderer } = require('electron');

// Zpřístupnění specifických systémových funkcí pro frontend (index.html)
contextBridge.exposeInMainWorld('electronAPI', {
    exportDocx: (htmlContent) => ipcRenderer.invoke('export-docx', htmlContent)
});
