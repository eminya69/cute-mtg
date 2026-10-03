const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openExternal: (url) => {
    if (typeof url === 'string') {
      ipcRenderer.send('open-external', url);
    }
  },
  refocusWindow: () => {
    ipcRenderer.send('refocus-window');
  },
  setIgnoreMenuShortcuts: (ignore) => {
    ipcRenderer.send('set-ignore-menu-shortcuts', !!ignore);
  },
  selectDeckFile: () => {
    return ipcRenderer.invoke('select-deck-file');
  },
  onMenuLoadDeck: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = () => callback();
    ipcRenderer.on('menu-load-deck', subscription);
    return () => {
      ipcRenderer.removeListener('menu-load-deck', subscription);
    };
  }
});
