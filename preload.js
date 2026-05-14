const { contextBridge, ipcRenderer } = require('electron');

// Zpřístupnění specifických systémových funkcí pro frontend (index.html)
contextBridge.exposeInMainWorld('electronAPI', {
    exportDocx: (htmlContent) => ipcRenderer.invoke('export-docx', htmlContent),
    searchAres: (ico) => ipcRenderer.invoke('search-ares', ico),
    getTemplates: () => ipcRenderer.invoke('get-templates'),
    saveTemplate: (type, content) => ipcRenderer.invoke('save-template', type, content),
    resetTemplates: () => ipcRenderer.invoke('reset-templates')
});
