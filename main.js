const { app, BrowserWindow, ipcMain, dialog, Menu, session: electronSession } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const SESSION_FILE = path.join(app.getPath('userData'), 'session.json');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const HOME_DIR = os.homedir();

let mainWindow;
let pendingFiles = []; // files requested before window is ready
const allowedFilePaths = new Set();

// Only allow session-restored paths within the user's home directory,
// preventing a tampered session.json from granting access to system files.
function isAllowedSessionPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  return resolved.startsWith(HOME_DIR + path.sep);
}

function grantFileAccess(filePath) {
  allowedFilePaths.add(path.resolve(filePath));
}

function hasFileAccess(filePath) {
  return typeof filePath === 'string' && allowedFilePaths.has(path.resolve(filePath));
}

function sanitizeTabForSession(tab) {
  return {
    id: typeof tab.id === 'string' ? tab.id : String(tab.id),
    name: typeof tab.name === 'string' ? tab.name.slice(0, 500) : 'Untitled',
    content: typeof tab.content === 'string' ? tab.content : '',
    cursorPos: typeof tab.cursorPos === 'number' && isFinite(tab.cursorPos) ? Math.floor(tab.cursorPos) : 0,
    filePath: hasFileAccess(tab.filePath) ? path.resolve(tab.filePath) : null,
  };
}

function createWindow() {
  const windowState = loadWindowState();
  const allowedWindowUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).toString();

  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#282a36',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== allowedWindowUrl) {
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Once the renderer is ready, send any pending files
  mainWindow.webContents.on('did-finish-load', () => {
    sendPendingFiles();
  });

  mainWindow.on('close', () => {
    saveWindowState();
  });

  buildMenu();
}

function sendPendingFiles() {
  if (!mainWindow || pendingFiles.length === 0) return;
  for (const filePath of pendingFiles) {
    sendFileToRenderer(filePath);
  }
  pendingFiles = [];
}

function sendFileToRenderer(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      dialog.showErrorBox('File Too Large', 'This file exceeds the 50 MB size limit and cannot be opened.');
      return;
    }
    grantFileAccess(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file:opened', { filePath, content });
  } catch {
    dialog.showErrorBox('Error', 'Could not read the requested file.');
  }
}

function openFilePath(filePath) {
  // Resolve to absolute path
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) return;

  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    sendFileToRenderer(absPath);
    mainWindow.focus();
  } else {
    pendingFiles.push(absPath);
  }
}

// --- macOS: handle files opened via Finder / "Open With" / drag to dock ---
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFilePath(filePath);
});

// --- Handle files passed as command-line arguments ---
function handleArgvFiles(argv) {
  // Skip electron binary and script paths, look for actual file paths
  const files = argv.slice(app.isPackaged ? 1 : 2).filter(arg => {
    if (arg.startsWith('-')) return false;
    try {
      return fs.existsSync(arg) && fs.statSync(arg).isFile();
    } catch {
      return false;
    }
  });
  for (const f of files) {
    openFilePath(f);
  }
}

// macOS: when app is already running and opened again with files
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    handleArgvFiles(argv);
  }
});

function loadWindowState() {
  try {
    const data = fs.readFileSync(SESSION_FILE, 'utf-8');
    const session = JSON.parse(data);
    return session.window || {};
  } catch {
    return {};
  }
}

function saveWindowState() {
  const bounds = mainWindow.getBounds();
  const session = loadSession();
  session.window = bounds;
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function loadSession() {
  try {
    const data = fs.readFileSync(SESSION_FILE, 'utf-8');
    const session = JSON.parse(data);
    if (Array.isArray(session.tabs)) {
      for (const tab of session.tabs) {
        // Only re-grant access to paths within the user's home directory
        if (typeof tab.filePath === 'string' && isAllowedSessionPath(tab.filePath)) {
          grantFileAccess(tab.filePath);
        }
      }
    }
    return session;
  } catch {
    return {};
  }
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.webContents.send('menu:new-tab'),
        },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile(),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu:save-as'),
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow.webContents.send('menu:close-tab'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('menu:find'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dark Theme',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => mainWindow.webContents.send('menu:set-theme', 'dark'),
        },
        {
          label: 'Light Theme',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow.webContents.send('menu:set-theme', 'light'),
        },
        { type: 'separator' },
        // DevTools only available in development builds
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { type: 'separator' }]),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'js', 'ts', 'json', 'html', 'css', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'sh', 'bash', 'zsh', 'sql', 'log'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      sendFileToRenderer(filePath);
    }
  }
}

// IPC handlers
ipcMain.handle('session:load', () => {
  return loadSession();
});

ipcMain.handle('session:save', (_event, sessionData) => {
  const session = loadSession();
  session.tabs = Array.isArray(sessionData.tabs)
    ? sessionData.tabs.map(sanitizeTabForSession)
    : [];
  session.activeTabId = typeof sessionData.activeTabId === 'string' ? sessionData.activeTabId : null;
  session.theme = sessionData.theme === 'dark' || sessionData.theme === 'light' ? sessionData.theme : 'dark';
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
});

ipcMain.handle('dialog:save-as', async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'untitled.txt',
  });
  if (!result.canceled && result.filePath) {
    grantFileAccess(result.filePath);
    return result.filePath;
  }
  return null;
});

ipcMain.handle('file:save-to-disk', async (_event, { filePath, content }) => {
  try {
    if (!hasFileAccess(filePath) || typeof content !== 'string') {
      return false;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('file:read', async (_event, filePath) => {
  try {
    if (!hasFileAccess(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
});

// Request single instance lock so second-instance event works
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // Deny all permission requests (camera, mic, geolocation, etc.)
    electronSession.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    app.setAboutPanelOptions({
      applicationName: app.name,
      copyright: 'Text editor built by Domas Jautakis',
    });
    createWindow();
    // Handle files passed via command line on first launch
    handleArgvFiles(process.argv);
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
