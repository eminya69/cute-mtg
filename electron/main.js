const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "Wifey: The Headpattening",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (e) {
      console.error('Invalid URL in windowOpenHandler:', e);
    }
    return { action: 'deny' };
  });

  ipcMain.removeAllListeners('open-external');
  ipcMain.on('open-external', (event, url) => {
    try {
      if (typeof url === 'string') {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(url);
        }
      }
    } catch (e) {
      console.error('Invalid URL in open-external:', e);
    }
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.focus();
  });

  ipcMain.removeAllListeners('refocus-window');
  ipcMain.on('refocus-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      mainWindow.webContents.focus();
    }
  });

  ipcMain.removeAllListeners('set-ignore-menu-shortcuts');
  ipcMain.on('set-ignore-menu-shortcuts', (event, ignore) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setIgnoreMenuShortcuts(ignore);
    }
  });

  let isSelectingDeck = false;
  ipcMain.removeHandler('select-deck-file');
  ipcMain.handle('select-deck-file', async () => {
    if (isSelectingDeck) return { canceled: true };
    isSelectingDeck = true;
    try {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Load MTG Deck (.o8d)",
        filters: [{ name: "OCTGN Deck (*.o8d, *.xml, *.txt)", extensions: ["o8d", "xml", "txt"] }, { name: "All Files", extensions: ["*"] }],
        properties: ["openFile"]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const content = await fs.promises.readFile(result.filePaths[0], 'utf8');
        return { canceled: false, content, filename: path.basename(result.filePaths[0]) };
      }
      return { canceled: true };
    } catch (err) {
      console.error('Error selecting deck file:', err);
      return { canceled: true, error: err.message };
    } finally {
      isSelectingDeck = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.focus();
      }
    }
  });

  mainWindow.webContents.on('context-menu', (e, params) => {
    if (!params.isEditable) {
      e.preventDefault();
    }
  });

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Load Deck (.o8d)...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-load-deck');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-undo')) document.getElementById('electron-undo').click()") },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-redo')) document.getElementById('electron-redo').click()") },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Options',
      submenu: [
        { label: 'Toggle Advanced Play Controls', accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-toggle-advanced-play')) document.getElementById('electron-toggle-advanced-play').click()") },
        { type: 'separator' },
        { label: 'London Mulligan', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-london-mulligan')) document.getElementById('electron-london-mulligan').click()") },
        { label: 'Game 2/3 (Keep Sideboard)', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-sideboard-reset')) document.getElementById('electron-sideboard-reset').click()") },
        { type: 'separator' },
        { label: 'Set Life to 20 (Constructed)', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-life-20')) document.getElementById('electron-life-20').click()") },
        { label: 'Set Life to 30 (Two-Headed Giant)', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-life-30')) document.getElementById('electron-life-30').click()") },
        { label: 'Set Life to 40 (Commander)', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-life-40')) document.getElementById('electron-life-40').click()") },
        { type: 'separator' },
        { label: 'Toggle Dark Mode', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-dark-mode')) document.getElementById('electron-dark-mode').click()") },
        { label: 'Customize Appearance (Sleeves & Playmat)...', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-appearance')) document.getElementById('electron-appearance').click()") },
        { type: 'separator' },
        { label: 'Restart My Deck', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-restart')) document.getElementById('electron-restart').click()") },
        { label: 'Clear All My Cards (Full Reset)', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-clear')) document.getElementById('electron-clear').click()") },
        { type: 'separator' },
        { label: 'Change Server IP', click: () => mainWindow.loadFile(path.join(__dirname, 'launcher.html')) },
        { label: 'Change Player Name', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-name')) document.getElementById('electron-name').click()") }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Keybinds & Help', click: () => mainWindow.webContents.executeJavaScript("if(document.getElementById('electron-help')) document.getElementById('electron-help').click()") }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Read config.cfg
  let configServer = "http://localhost:3000";
  let autoconnect = false;
  
  try {
    const configPath = path.join(path.dirname(app.getPath('exe')), 'config.cfg');
    if (fs.existsSync(configPath)) {
      const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.length === 0) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
          let value = trimmed.slice(eqIdx + 1).trim();
          if (value.endsWith(';')) value = value.slice(0, -1).trim();
          if (key === 'server') {
            configServer = value;
          } else if (key === 'autoconnect') {
            autoconnect = value.toLowerCase() === 'true';
          }
        }
      });
    } else {
      try {
        fs.writeFileSync(configPath, `#This is a config file\nServer = http://localhost:3000\nAutoconnect = false\n`, 'utf8');
      } catch (writeErr) {
        console.warn('Could not write default config.cfg (directory may be read-only):', writeErr.message);
      }
    }
  } catch (e) {
    console.error('Error reading config.cfg:', e);
  }

  try {
    new URL(configServer);
  } catch (urlErr) {
    console.warn('Invalid server URL in config, resetting to default:', configServer);
    configServer = "http://localhost:3000";
  }

  if (autoconnect) {
    if (configServer.includes('?')) {
      mainWindow.loadURL(configServer + '&electron=true');
    } else {
      mainWindow.loadURL(configServer + '?electron=true');
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, 'launcher.html'), { query: { server: configServer } });
  }
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log('Failed to load:', errorDescription);
    mainWindow.loadFile(path.join(__dirname, 'launcher.html'), { query: { server: configServer, error: errorDescription } });
  });
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
