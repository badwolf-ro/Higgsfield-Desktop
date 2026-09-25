const { app, BrowserWindow, Menu, shell, clipboard, screen, session, dialog, ipcMain, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./src/main/settings');
const hotkeys = require('./src/main/hotkeys');
const downloads = require('./src/main/downloads');
const tray = require('./src/main/tray');
const notify = require('./src/main/notify');
const viewport = require('./src/main/viewport');
const workspaces = require('./src/main/workspaces');
const projects = require('./src/main/projects');
const menu = require('./src/main/menu');
const { HOME, SECTIONS, ACTIONS, byId } = require('./src/shared/actions');

// A separate profile folder for testing and development (also gets its own
// single-instance lock, so it can run next to the everyday app).
if (process.env.HIGGSFIELD_PROFILE) app.setPath('userData', process.env.HIGGSFIELD_PROFILE);

const PARTITION = 'persist:higgsfield'; // keeps login cookies between launches
const ICON = path.join(__dirname, 'build', 'icon.png');
const SHELL_PAGE = path.join(__dirname, 'src', 'renderer', 'shell', 'index.html');
const SETTINGS_PAGE = path.join(__dirname, 'src', 'renderer', 'settings', 'index.html');
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const LAYOUT_FILE = path.join(app.getPath('userData'), 'layout.json'); // before projects existed

// Hosts (and their subdomains) that belong to Higgsfield itself.
const SITE_HOSTS = ['higgsfield.ai', 'higgs.ai'];

// Sign-in and payment pages that must open inside the app so the flow
// can hand the session back to Higgsfield. Paths narrow hosts that also
// serve ordinary public pages (a Discord invite should go to the browser).
const FLOW_HOSTS = [
  { host: /^accounts\.google\.[a-z.]+$/ },
  { host: /^accounts\.youtube\.com$/ },
  { host: /^appleid\.apple\.com$/ },
  { host: /^login\.(microsoftonline|live)\.com$/ },
  { host: /^(www\.)?facebook\.com$/, path: /^\/(v[\d.]+\/)?dialog\/oauth/ },
  { host: /^discord\.com$/, path: /^\/(api\/)?oauth2/ },
  { host: /^github\.com$/, path: /^\/(login|sessions)/ },
  { host: /\.clerk\.(com|dev)$|\.accounts\.dev$/ },
  { host: /^(checkout|pay|js|hooks|m)\.stripe\.com$/ },
  { host: /^(www\.)?paypal\.com$/ },
];

function parse(url) {
  try { return new URL(url); } catch { return null; }
}

function isSite(url) {
  const u = parse(url);
  return !!u && u.protocol === 'https:' &&
    SITE_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
}

function isFlow(url) {
  const u = parse(url);
  return !!u && u.protocol === 'https:' &&
    FLOW_HOSTS.some(f => f.host.test(u.hostname) && (!f.path || f.path.test(u.pathname)));
}

function openExternal(url) {
  const u = parse(url);
  if (u && ['http:', 'https:', 'mailto:'].includes(u.protocol)) shell.openExternal(url);
}

// Present as plain Chrome: Google refuses sign-in from UAs that name Electron.
function cleanUserAgent(ua) {
  return ua.replace(/\s(?!(?:AppleWebKit|Chrome|Safari)\/)[^\s/()]+\/\S+/g, '');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* not worth failing over */ }
}

function loadWindowState() {
  const s = readJson(STATE_FILE);
  if (!s) return { width: 1440, height: 900 };
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    s.x < a.x + a.width && s.x + s.width > a.x && s.y < a.y + a.height && s.y + s.height > a.y);
  if (!onScreen) { delete s.x; delete s.y; }
  return s;
}

let mainWindow = null;
let settingsWindow = null;
let openTabs = []; // latest list from the tab UI, see SPEC 'tabs-changed'
let currentLayout = null; // the tab UI's live layout, autosaved to layout.json
let generating = 0;
const savedFiles = new Set(); // downloads the tab UI may reveal in Explorer
const tabProjects = new Map(); // tab webContentsId -> { key, at }: the Cinema Studio project it is in

function sendCommand(command, { reveal = true } = {}) {
  if (!mainWindow) return;
  if (reveal && !mainWindow.isVisible()) tray.showWindow();
  mainWindow.webContents.send('shell:command', command);
}

function toast(text) {
  sendCommand({ type: 'toast', text }, { reveal: false });
}

// Asks for a line of text in a dialog drawn by the tab UI.
let promptSeq = 0;
const pendingPrompts = new Map();
function prompt(options) {
  if (!mainWindow) return Promise.resolve(null);
  const requestId = ++promptSeq;
  return new Promise(resolve => {
    pendingPrompts.set(requestId, resolve);
    sendCommand({ type: 'prompt', requestId, ...options });
  });
}

async function saveWorkspace() {
  const name = await prompt({
    title: 'Save workspace',
    message: 'Saves your current tabs and layout under a name, so you can load them again later.',
    value: '',
    okLabel: 'Save',
  });
  if (!name) return;
  let result = workspaces.create(name, currentLayout);
  if (!result.ok && result.code === 'exists') {
    const { response } = await showMessage({
      type: 'question',
      title: 'Higgsfield',
      message: `Replace the workspace "${name}"?`,
      detail: 'It will be overwritten with your current tabs and layout.',
      buttons: ['Replace', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
    result = workspaces.replace(result.id, currentLayout);
  }
  if (result.ok) toast(`Workspace "${result.workspace.name}" saved`);
  else showMessage({ type: 'error', title: 'Higgsfield', message: 'Could not save the workspace', detail: result.error });
}

function loadWorkspace(id) {
  const ws = workspaces.get(id);
  if (!ws) return { ok: false, error: 'That workspace no longer exists.' };
  sendCommand({ type: 'loadLayout', layout: ws.layout, token: 1 });
  toast(`Workspace "${ws.name}" loaded`);
  return { ok: true, workspace: ws };
}

// The Cinema Studio project the active tab is in, or null.
function activeProject() {
  const tab = openTabs.find(t => t.active);
  const entry = tab && tabProjects.get(tab.webContentsId);
  return entry ? projects.get(entry.key) : null;
}

let shownProjectKey;
function showActiveProject() {
  const project = activeProject();
  const key = project ? project.key + '|' + project.name + '|' + projects.folderFor(project) : null;
  if (key === shownProjectKey) return;
  shownProjectKey = key;
  sendCommand(project
    ? { type: 'csProject', name: project.name, folder: projects.folderFor(project) }
    : { type: 'csProject', name: null }, { reveal: false });
}

function recentProjects() {
  return projects.list().slice(0, 10).map(({ key, name }) => ({ key, name }));
}

// Called whenever a tab changes page.
function trackTab(contents, url) {
  const project = projects.seen(url, tabProjects.get(contents.id));
  if (project) tabProjects.set(contents.id, { key: project.key, at: Date.now() });
  else tabProjects.delete(contents.id);
  showActiveProject();
}

// Downloads started in a tab that is inside a Cinema Studio project go to its folder.
function downloadFolderFor(contents) {
  const entry = contents && tabProjects.get(contents.id);
  const project = entry && projects.get(entry.key);
  return project ? projects.folderFor(project) : settings.get().downloads.folder;
}

async function renameActiveProject() {
  const project = activeProject();
  if (!project) return;
  const name = await prompt({
    title: 'Rename project folder',
    message: 'The name used for this project in the app and for its download folder. Higgsfield is not changed.',
    value: project.name,
    okLabel: 'Rename',
  });
  if (name) projects.rename(project.key, name);
}

function projectOp(op, args) {
  const a = args && typeof args === 'object' ? args : {};
  const project = projects.get(a.key);
  if (!project) return { ok: false, error: 'That project is no longer in the list.' };
  switch (op) {
    case 'rename': return projects.rename(a.key, a.name);
    case 'resetFolder': return projects.setFolder(a.key, null);
    case 'openFolder': downloads.openFolder(projects.folderFor(project)); return { ok: true };
    case 'open': sendCommand({ type: 'newTab', url: project.url }); return { ok: true };
    case 'forget': return projects.forget(a.key);
    default: return { ok: false, error: 'Unknown project operation.' };
  }
}

async function chooseProjectFolder(key) {
  if (!projects.get(key)) return { ok: false, error: 'That project is no longer in the list.' };
  const folder = await downloads.chooseFolder(settingsWindow || mainWindow);
  return folder ? projects.setFolder(key, folder) : { ok: true };
}

function setLocked(locked) {
  settings.update({ layout: { locked: !!locked } });
}

function dispatch(id) {
  const action = byId[id];
  if (!action) return;
  if (action.handler === 'shell') return sendCommand({ type: id });
  if (id.startsWith('open:')) return sendCommand({ type: 'newTab', url: action.url });
  if (id.startsWith('workspace:')) {
    const ws = workspaces.list()[Number(id.slice(10)) - 1];
    if (ws) loadWorkspace(ws.id);
    return;
  }
  switch (id) {
    case 'saveWorkspace': saveWorkspace(); break;
    case 'toggleLock': setLocked(!settings.get().layout.locked); break;
    case 'toggleFullscreen':
      if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
      break;
    case 'openDownloads': {
      const project = activeProject();
      downloads.openFolder(project ? projects.folderFor(project) : undefined);
      break;
    }
    case 'openSettings': openSettings('general'); break;
    case 'openHotkeys': openSettings('hotkeys'); break;
    case 'clearCache': clearCache(); break;
    case 'toggleWindow': tray.toggleWindow(); break;
  }
}

let menuTimer = null;
function refreshMenu() {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => {
    Menu.setApplicationMenu(menu.build({
      dispatch,
      accelerator: id => hotkeys.menuAccelerator(id),
      sendCommand,
      openSettings,
      clearAllData,
      tabs: openTabs,
      workspaces: workspaces.list(),
      loadWorkspace,
      locked: settings.get().layout.locked,
    }));
  }, 150);
}

function showMessage(options) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function formatBytes(n) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

// Drops cached files and scripts but keeps cookies and local storage,
// so the login survives.
async function clearCache() {
  const ses = session.fromPartition(PARTITION);
  const size = await ses.getCacheSize();
  await ses.clearCache();
  await ses.clearCodeCaches({});
  await ses.clearStorageData({ storages: ['cachestorage', 'serviceworkers', 'shadercache'] });
  sendCommand({ type: 'reloadAll' }, { reveal: false });
  showMessage({
    type: 'info',
    title: 'Higgsfield',
    message: 'Cache cleared',
    detail: `${formatBytes(size)} of cached files removed. You are still signed in.`,
  });
}

async function clearAllData() {
  const { response } = await showMessage({
    type: 'warning',
    title: 'Higgsfield',
    message: 'Clear all Higgsfield data?',
    detail: 'This signs you out and removes cookies, site settings and cached files. '
      + 'Your generations are stored on your Higgsfield account and are not affected.',
    buttons: ['Clear and Sign Out', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  const ses = session.fromPartition(PARTITION);
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.clearAuthCache();
  sendCommand({ type: 'reloadAll' });
}

function buildContextMenu(contents, p) {
  const sep = { type: 'separator' };
  const history = contents.navigationHistory;
  const groups = [];

  if (p.misspelledWord && p.dictionarySuggestions.length) {
    groups.push(p.dictionarySuggestions.slice(0, 5).map(word => ({
      label: word, click: () => contents.replaceMisspelling(word),
    })));
  }
  if (p.linkURL) {
    groups.push([
      ...(isSite(p.linkURL) ? [{ label: 'Open Link in New Tab', click: () => sendCommand({ type: 'newTab', url: p.linkURL }) }] : []),
      { label: 'Open Link in Browser', click: () => openExternal(p.linkURL) },
      { label: 'Copy Link Address', click: () => clipboard.writeText(p.linkURL) },
    ]);
  }
  if (p.mediaType === 'image' && p.srcURL) {
    groups.push([
      { label: 'Save Image', click: () => downloads.save(contents, p.srcURL) },
      { label: 'Save Image As…', click: () => downloads.saveAs(contents, p.srcURL) },
      { label: 'Copy Image', click: () => contents.copyImageAt(p.x, p.y) },
      { label: 'Copy Image Address', click: () => clipboard.writeText(p.srcURL) },
    ]);
  }
  if (p.mediaType === 'video' && p.srcURL) {
    groups.push([
      { label: 'Save Video', click: () => downloads.save(contents, p.srcURL) },
      { label: 'Save Video As…', click: () => downloads.saveAs(contents, p.srcURL) },
      { label: 'Copy Video Address', click: () => clipboard.writeText(p.srcURL) },
    ]);
  }
  if (p.isEditable) {
    groups.push([
      { role: 'cut', enabled: p.editFlags.canCut },
      { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste },
      { role: 'selectAll' },
    ]);
  } else if (p.selectionText.trim()) {
    groups.push([{ role: 'copy' }]);
  }
  groups.push([
    { label: 'Back', enabled: history.canGoBack(), click: () => history.goBack() },
    { label: 'Forward', enabled: history.canGoForward(), click: () => history.goForward() },
    { label: 'Reload', click: () => contents.reload() },
  ]);
  groups.push([{ label: 'Inspect Element', click: () => contents.inspectElement(p.x, p.y) }]);

  return Menu.buildFromTemplate(groups.flatMap((g, i) => (i ? [sep, ...g] : g)));
}

// A Higgsfield page: a tab's webview, or a sign-in popup opened from one.
function wirePage(contents) {
  contents.on('did-navigate', (_e, url) => trackTab(contents, url));
  contents.on('did-navigate-in-page', (_e, url, isMainFrame) => { if (isMainFrame) trackTab(contents, url); });
  contents.once('destroyed', () => tabProjects.delete(contents.id));
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (isSite(url)) {
      sendCommand({ type: 'newTab', url, background: disposition === 'background-tab' });
      return { action: 'deny' };
    }
    if (url === 'about:blank' || isFlow(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { icon: ICON, backgroundColor: '#0f1113', autoHideMenuBar: true },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  contents.on('did-create-window', win => wirePage(win.webContents));

  contents.on('will-navigate', (event, url) => {
    // Once a sign-in or checkout flow has left Higgsfield, let it finish
    // wherever it goes; it returns to Higgsfield on its own.
    if (isSite(url) || isFlow(url) || !isSite(contents.getURL())) return;
    event.preventDefault();
    openExternal(url);
  });

  contents.on('context-menu', (_event, params) => {
    buildContextMenu(contents, params).popup();
  });
}

// The app's own pages (tab UI, settings) never navigate or open windows.
function lockDown(contents) {
  contents.on('will-navigate', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createMainWindow() {
  const state = loadWindowState();
  const autoHide = settings.get().menuBar.autoHide;
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    title: 'Higgsfield',
    icon: ICON,
    backgroundColor: '#0f1113',
    autoHideMenuBar: autoHide,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload', 'shell.js'),
      webviewTag: true,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // keep layout saves and tab updates prompt while minimised
    },
  });

  const contents = mainWindow.webContents;
  lockDown(contents);
  hotkeys.attach(contents);

  contents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isSite(params.src) && !isFlow(params.src)) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.spellcheck = true;
    // Background tabs must keep polling so generation alerts arrive on time.
    webPreferences.backgroundThrottling = false;
    params.partition = PARTITION;
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('focus', () => mainWindow.flashFrame(false));
  mainWindow.on('close', event => {
    writeJson(STATE_FILE, { ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() });
    tray.handleClose(event);
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // Mouse side buttons
  mainWindow.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') sendCommand({ type: 'back' });
    if (cmd === 'browser-forward') sendCommand({ type: 'forward' });
  });

  mainWindow.loadFile(SHELL_PAGE);
}

function openSettings(section = 'general') {
  if (settingsWindow) {
    settingsWindow.webContents.send('settings:show-section', section);
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    parent: mainWindow || undefined,
    title: 'Higgsfield Settings',
    icon: ICON,
    backgroundColor: '#0f1113',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload', 'settings.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  settingsWindow.setMenu(null);
  lockDown(settingsWindow.webContents);
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    hotkeys.suspendGlobal(false);
  });
  settingsWindow.loadFile(SETTINGS_PAGE, { query: { section } });
}

function fromShell(event) {
  return !!mainWindow && event.sender === mainWindow.webContents;
}

function fromSettings(event) {
  return !!settingsWindow && event.sender === settingsWindow.webContents;
}

// A tab of the main window, by its webContents id.
function isTab(id) {
  const contents = Number.isInteger(id) ? webContents.fromId(id) : null;
  return !!contents && contents.getType() === 'webview' && !!mainWindow
    && contents.hostWebContents === mainWindow.webContents;
}

// Shared by the Settings page and the tab UI's Workspace menu.
function workspaceOp(op, args) {
  const a = args && typeof args === 'object' ? args : {};
  switch (op) {
    case 'save': return workspaces.create(a.name, currentLayout);
    case 'replace': return workspaces.replace(a.id, currentLayout);
    case 'load': return loadWorkspace(a.id);
    case 'rename': return workspaces.rename(a.id, a.name);
    case 'delete': return workspaces.remove(a.id);
    case 'move': return workspaces.move(a.id, a.delta);
    default: return { ok: false, error: 'Unknown workspace operation.' };
  }
}

function registerIpc() {
  ipcMain.handle('shell:get-initial-state', event => {
    if (!fromShell(event)) return null;
    return {
      home: HOME,
      sections: SECTIONS,
      layout: currentLayout,
      layoutToken: 1,
      csProjects: recentProjects(),
      partition: PARTITION,
      workspaces: workspaces.list().map(({ id, name }) => ({ id, name })),
      locked: settings.get().layout.locked,
      generating,
    };
  });
  ipcMain.on('shell:save-layout', (event, payload) => {
    if (!fromShell(event) || !payload || typeof payload !== 'object') return;
    const tagged = 'token' in payload && 'layout' in payload;
    const layout = tagged ? payload.layout : payload;
    if (!layout || typeof layout !== 'object') return;
    currentLayout = layout;
    writeJson(LAYOUT_FILE, layout);
  });
  ipcMain.on('shell:project', (event, r) => {
    if (!fromShell(event) || !r) return;
    if (r.op === 'openFolder') dispatch('openDownloads');
    else if (r.op === 'rename') renameActiveProject();
    else if (r.op === 'all') sendCommand({ type: 'newTab', url: HOME + 'generate?view=projects' });
    else if (r.op === 'open' && r.args) projectOp('open', r.args);
    else if (r.op === 'manage') openSettings('projects');
  });
  ipcMain.on('shell:viewport', (event, v) => {
    if (fromShell(event) && v && isTab(v.webContentsId)) viewport.update(v.webContentsId, v);
  });
  ipcMain.on('shell:prompt-result', (event, r) => {
    if (!fromShell(event) || !r) return;
    const resolve = pendingPrompts.get(r.requestId);
    if (!resolve) return;
    pendingPrompts.delete(r.requestId);
    resolve(typeof r.value === 'string' && r.value.trim() ? r.value.trim() : null);
  });
  ipcMain.on('shell:workspace', (event, r) => {
    if (!fromShell(event) || !r) return;
    if (r.op === 'save') saveWorkspace();
    else if (r.op === 'manage') openSettings('workspaces');
    else if (r.op === 'reset') sendCommand({ type: 'resetLayout' });
    else if (r.op === 'load' && r.args) loadWorkspace(r.args.id);
  });
  ipcMain.on('shell:set-locked', (event, locked) => {
    if (fromShell(event)) setLocked(locked);
  });
  ipcMain.on('shell:tabs-changed', (event, tabs) => {
    if (!fromShell(event) || !Array.isArray(tabs)) return;
    openTabs = tabs.map(t => ({
      webContentsId: Number.isInteger(t.webContentsId) ? t.webContentsId : null,
      title: String(t.title || ''),
      url: String(t.url || ''),
      active: !!t.active,
      visible: !!t.visible,
    }));
    showActiveProject();
    refreshMenu();
  });
  ipcMain.on('shell:show-in-folder', (event, filePath) => {
    if (fromShell(event) && savedFiles.has(filePath)) shell.showItemInFolder(filePath);
  });

  ipcMain.handle('settings:get-state', event => {
    if (!fromSettings(event)) return null;
    return {
      settings: settings.get(),
      actions: ACTIONS,
      defaults: settings.defaults(),
      workspaces: workspaces.list(),
      projects: { root: settings.get().downloads.folder, items: projects.list() },
    };
  });
  ipcMain.handle('settings:project', async (event, op, args) => {
    if (!fromSettings(event)) return { ok: false, error: 'Not allowed.' };
    const result = op === 'chooseFolder'
      ? await chooseProjectFolder(args && args.key)
      : projectOp(String(op), args);
    const { project: _p, ...rest } = result;
    return { ...rest, projects: { root: settings.get().downloads.folder, items: projects.list() } };
  });
  ipcMain.handle('settings:workspace', (event, op, args) => {
    if (!fromSettings(event)) return { ok: false, error: 'Not allowed.' };
    const result = workspaceOp(String(op), args);
    const { workspace: _ws, ...rest } = result;
    return { ...rest, workspaces: workspaces.list() };
  });
  ipcMain.handle('settings:update', (event, patch) => {
    if (!fromSettings(event) || !patch || typeof patch !== 'object') return settings.get();
    const { hotkeys: _ignored, ...rest } = patch; // shortcuts go through set-hotkey validation
    return settings.update(rest);
  });
  ipcMain.handle('settings:set-hotkey', (event, id, accelerator) => {
    if (!fromSettings(event)) return { ok: false, error: 'Not allowed.' };
    return hotkeys.setHotkey(String(id), String(accelerator || ''));
  });
  ipcMain.handle('settings:reset-hotkeys', event => {
    if (!fromSettings(event)) return settings.get();
    return hotkeys.resetHotkeys();
  });
  ipcMain.handle('settings:choose-folder', event => {
    if (!fromSettings(event)) return null;
    return downloads.chooseFolder(settingsWindow);
  });
  ipcMain.on('settings:open-folder', event => {
    if (fromSettings(event)) downloads.openFolder(settings.get().downloads.folder);
  });
  ipcMain.on('settings:recording', (event, recording) => {
    if (fromSettings(event)) hotkeys.suspendGlobal(!!recording);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('ro.badwolf.higgsfield');
  app.userAgentFallback = cleanUserAgent(app.userAgentFallback);

  app.on('second-instance', () => tray.showWindow());

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    wirePage(contents);
    hotkeys.attach(contents);
    notify.watch(contents);
    viewport.watch(contents);
  });

  app.whenReady().then(() => {
    settings.load();
    workspaces.load();
    projects.load({ getRoot: () => settings.get().downloads.folder });
    currentLayout = readJson(LAYOUT_FILE);
    const ses = session.fromPartition(PARTITION);

    // Only Higgsfield and its sign-in/payment pages get camera, mic, clipboard, notifications.
    ses.setPermissionRequestHandler((_wc, _permission, callback, details) => {
      const url = details.requestingUrl || '';
      callback(isSite(url) || isFlow(url));
    });

    hotkeys.init({
      settings,
      dispatch,
      shouldHandle: contents => !settingsWindow || contents !== settingsWindow.webContents,
    });

    downloads.init({
      session: ses,
      settings,
      getWindow: () => mainWindow,
      getFolder: downloadFolderFor,
      onSaved: ({ filePath, filename }) => {
        savedFiles.add(filePath);
        const project = projects.list().find(p => path.dirname(filePath) === p.downloadFolder);
        const where = project ? ` to ${project.name}` : '';
        sendCommand({ type: 'toast', text: `Saved ${filename}${where}`, filePath }, { reveal: false });
      },
    });

    tray.init({
      getWindow: () => mainWindow,
      settings,
      icon: ICON,
      onNewTab: () => sendCommand({ type: 'newTab' }),
      onOpenDownloads: () => downloads.openFolder(),
      onQuit: () => app.quit(),
    });

    notify.init({
      settings,
      icon: ICON,
      getWindow: () => mainWindow,
      getTab: id => openTabs.find(t => t.webContentsId === id) || null,
      onFolderRenamed: (id, name) => projects.renamedOnHiggsfield(id, name),
      onClick: id => {
        tray.showWindow();
        sendCommand({ type: 'focusTab', webContentsId: id });
      },
      onStatus: count => {
        generating = count;
        sendCommand({ type: 'status', generating: count }, { reveal: false });
      },
    });

    viewport.init({
      settings,
      onInfo: info => sendCommand({ type: 'viewportInfo', ...info }, { reveal: false }),
      onZoomRequest: (id, direction) => {
        sendCommand({ type: direction === 'in' ? 'zoomIn' : 'zoomOut', webContentsId: id }, { reveal: false });
      },
    });

    projects.on('change', list => {
      sendCommand({ type: 'csProjects', items: recentProjects() }, { reveal: false });
      showActiveProject();
      if (settingsWindow) {
        settingsWindow.webContents.send('settings:projects-changed', { root: settings.get().downloads.folder, items: list });
      }
    });

    workspaces.on('change', list => {
      sendCommand({ type: 'workspaces', items: list.map(({ id, name }) => ({ id, name })) }, { reveal: false });
      if (settingsWindow) settingsWindow.webContents.send('settings:workspaces-changed', list);
      refreshMenu();
    });

    settings.on('change', (snapshot, patch) => {
      if (settingsWindow) settingsWindow.webContents.send('settings:changed', snapshot);
      if (mainWindow && patch.menuBar) {
        mainWindow.setAutoHideMenuBar(snapshot.menuBar.autoHide);
        mainWindow.setMenuBarVisibility(!snapshot.menuBar.autoHide);
      }
      if (patch.layout) {
        viewport.refreshAll();
        sendCommand({ type: 'setLocked', locked: snapshot.layout.locked }, { reveal: false });
      }
      if (patch.downloads && settingsWindow) {
        // Project folders are shown relative to the download folder.
        settingsWindow.webContents.send('settings:projects-changed', { root: snapshot.downloads.folder, items: projects.list() });
      }
      if (patch.hotkeys || patch.layout) refreshMenu();
    });

    registerIpc();
    refreshMenu();
    createMainWindow();
  });

  app.on('before-quit', () => tray.setQuitting());
  app.on('will-quit', () => {
    hotkeys.dispose();
    tray.destroy();
  });
  app.on('window-all-closed', () => app.quit());
}
