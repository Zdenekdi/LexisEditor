const { contextBridge, ipcRenderer } = require('electron');

// Zpřístupnění specifických systémových funkcí pro frontend (index.html)
contextBridge.exposeInMainWorld('electronAPI', {
    exportDocx: (htmlContent) => ipcRenderer.invoke('export-docx', htmlContent),
    searchAres: (ico) => ipcRenderer.invoke('search-ares', ico),
    getTemplates: () => ipcRenderer.invoke('get-templates'),
    saveTemplate: (type, content) => ipcRenderer.invoke('save-template', type, content),
    resetTemplates: () => ipcRenderer.invoke('reset-templates'),
    getAppVersion: () => ipcRenderer.invoke('get-version'),
    onUpdateMessage: (callback) => ipcRenderer.on('update-message', (_event, value) => callback(value)),
    installUpdate: () => ipcRenderer.send('install-update'),
    exportBundle: (html, css) => ipcRenderer.invoke('export-bundle', html, css),
    saveIsdsConfig: (config) => ipcRenderer.invoke('save-isds-config', config),
    getIsdsConfig: () => ipcRenderer.invoke('get-isds-config'),
    savePostConfig: (config) => ipcRenderer.invoke('save-post-config', config),
    getPostConfig: () => ipcRenderer.invoke('get-post-config'),
    testIsdsConnection: (creds) => ipcRenderer.invoke('test-isds-connection', creds),
    testPostConnection: (creds) => ipcRenderer.invoke('test-post-connection', creds),
    authenticateBiometric: (reason) => ipcRenderer.invoke('authenticate-biometric', reason),
    importPdf: () => ipcRenderer.invoke('import-pdf'),
    importZfo: () => ipcRenderer.invoke('import-zfo'),
    importPdfBase64: (base64) => ipcRenderer.invoke('import-pdf-base64', base64),
    saveAIConfig: (config) => ipcRenderer.invoke('save-ai-config', config),
    getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
    startLexisLink: () => ipcRenderer.invoke('start-lexis-link'),
    onLexisLinkCommand: (callback) => ipcRenderer.on('lexis-link-command', (event, cmd) => callback(cmd))
});
