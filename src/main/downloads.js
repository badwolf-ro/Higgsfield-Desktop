// Downloads. save()/saveAs() queue a URL and then trigger it; the session's
// will-download decides where it goes. A plain download the page starts itself
// (a link, the context menu) falls through to the autoSave setting.
const { dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let session;
let settings;
let getWindow = () => null;
// Where a download started in `webContents` goes; see init().
let getFolder = () => settings.get().downloads.folder;
let onSaved = () => {};

// URL -> pending count, so the same file downloaded twice is still matched.
const saveUrls = new Map();
const saveAsUrls = new Map();
const active = new Set();

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'application/zip': 'zip',
};

function extensionForMime(mime) {
  return MIME_EXT[(mime || '').toLowerCase()] || '';
}

function sanitizeFilename(name) {
  let out = String(name || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '');
  if (!out) out = `higgsfield-${Date.now()}`;
  return out;
}

function withExtension(name, mime) {
  if (path.extname(name)) return name;
  const ext = extensionForMime(mime);
  return ext ? `${name}.${ext}` : name;
}

// Adds " (n)" before the extension until the path is free.
function uniqueFilePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

function take(map, url) {
  const n = map.get(url);
  if (!n) return false;
  if (n <= 1) map.delete(url);
  else map.set(url, n - 1);
  return true;
}

function updateProgress() {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (active.size === 0) { win.setProgressBar(-1); return; }
  let received = 0;
  let total = 0;
  let indeterminate = false;
  for (const item of active) {
    const t = item.getTotalBytes();
    if (!t) indeterminate = true;
    else { total += t; received += item.getReceivedBytes(); }
  }
  if (indeterminate) win.setProgressBar(2, { mode: 'indeterminate' });
  else win.setProgressBar(total ? received / total : -1);
}

function onWillDownload(_event, item, webContents) {
  const folder = getFolder(webContents);
  const origUrl = item.getURLChain()[0] || item.getURL();
  const filename = withExtension(sanitizeFilename(item.getFilename()), item.getMimeType());

  const isSaveAs = take(saveAsUrls, origUrl);
  const isSave = !isSaveAs && take(saveUrls, origUrl);
  const autoSave = settings.get().downloads.autoSave;

  if (isSaveAs || (!isSave && !autoSave)) {
    item.setSaveDialogOptions({ defaultPath: path.join(folder, filename) });
  } else {
    try { fs.mkdirSync(folder, { recursive: true }); } catch { /* dialog fallback below */ }
    item.setSavePath(uniqueFilePath(folder, filename));
  }

  active.add(item);
  item.on('updated', updateProgress);
  item.once('done', (_e, state) => {
    active.delete(item);
    updateProgress();
    if (state === 'completed') {
      const filePath = item.getSavePath();
      onSaved({ filePath, filename: path.basename(filePath) });
    }
  });
  updateProgress();
}

function init(opts) {
  session = opts.session;
  settings = opts.settings;
  if (typeof opts.getWindow === 'function') getWindow = opts.getWindow;
  if (typeof opts.getFolder === 'function') getFolder = opts.getFolder;
  if (typeof opts.onSaved === 'function') onSaved = opts.onSaved;
  session.on('will-download', onWillDownload);
}

function save(webContents, url) {
  saveUrls.set(url, (saveUrls.get(url) || 0) + 1);
  webContents.downloadURL(url);
}

function saveAs(webContents, url) {
  saveAsUrls.set(url, (saveAsUrls.get(url) || 0) + 1);
  webContents.downloadURL(url);
}

function openFolder(folder = settings.get().downloads.folder) {
  try { fs.mkdirSync(folder, { recursive: true }); } catch { /* still try to open */ }
  shell.openPath(folder);
}

function chooseFolder(parentWindow) {
  const opts = { properties: ['openDirectory', 'createDirectory'] };
  const promise = parentWindow
    ? dialog.showOpenDialog(parentWindow, opts)
    : dialog.showOpenDialog(opts);
  return promise.then(r => (r.canceled || !r.filePaths.length ? null : r.filePaths[0]));
}

module.exports = {
  init, save, saveAs, openFolder, chooseFolder,
  sanitizeFilename, extensionForMime, withExtension, uniqueFilePath,
};
