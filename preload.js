const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  saveAs: (defaultName) => ipcRenderer.invoke('dialog:save-as', defaultName),
  saveToDisk: (filePath, content) => ipcRenderer.invoke('file:save-to-disk', { filePath, content }),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  // Remove any existing listeners before registering to prevent accumulation
  // if these are ever called more than once.
  onNewTab: (cb) => { ipcRenderer.removeAllListeners('menu:new-tab'); ipcRenderer.on('menu:new-tab', cb); },
  onCloseTab: (cb) => { ipcRenderer.removeAllListeners('menu:close-tab'); ipcRenderer.on('menu:close-tab', cb); },
  onSaveAs: (cb) => { ipcRenderer.removeAllListeners('menu:save-as'); ipcRenderer.on('menu:save-as', cb); },
  onFind: (cb) => { ipcRenderer.removeAllListeners('menu:find'); ipcRenderer.on('menu:find', cb); },
  onFileOpened: (cb) => { ipcRenderer.removeAllListeners('file:opened'); ipcRenderer.on('file:opened', (_e, data) => cb(data)); },
  onSetTheme: (cb) => { ipcRenderer.removeAllListeners('menu:set-theme'); ipcRenderer.on('menu:set-theme', (_e, theme) => cb(theme)); },
});
