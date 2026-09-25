// System tray icon. Closing the window hides to the tray (when enabled) rather
// than quitting, so the site's session and any running generations stay alive.
const { Tray, Menu, nativeImage } = require('electron');

let tray = null;
let settings;
let getWindow = () => null;
let onNewTab = () => {};
let onOpenDownloads = () => {};
let onQuit = () => {};
let quitting = false;

function showWindow() {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWindow();
}

function init(opts) {
  settings = opts.settings;
  if (typeof opts.getWindow === 'function') getWindow = opts.getWindow;
  if (typeof opts.onNewTab === 'function') onNewTab = opts.onNewTab;
  if (typeof opts.onOpenDownloads === 'function') onOpenDownloads = opts.onOpenDownloads;
  if (typeof opts.onQuit === 'function') onQuit = opts.onQuit;

  const image = nativeImage.createFromPath(opts.icon).resize({ width: 32, height: 32, quality: 'best' });
  tray = new Tray(image);
  tray.setToolTip('Higgsfield');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Higgsfield', click: () => showWindow() },
    { label: 'New tab', click: () => onNewTab() },
    { label: 'Open downloads folder', click: () => onOpenDownloads() },
    { type: 'separator' },
    { label: 'Quit Higgsfield', click: () => onQuit() },
  ]));
  tray.on('click', () => toggleWindow());
  return tray;
}

function handleClose(event) {
  const s = settings.get();
  if (quitting || !s.tray.closeToTray) return;

  event.preventDefault();
  const win = getWindow();
  if (win && !win.isDestroyed()) win.hide();

  if (!s.tray.hintShown) {
    if (tray && process.platform === 'win32') {
      tray.displayBalloon({
        title: 'Higgsfield is still running in the tray',
        content: 'Click the tray icon to show it again, right-click it to quit, '
          + 'or turn this off in Settings.',
      });
    }
    settings.update({ tray: { hintShown: true } });
  }
}

function setQuitting() {
  quitting = true;
}

function destroy() {
  if (tray) { tray.destroy(); tray = null; }
}

module.exports = { init, toggleWindow, showWindow, handleClose, setQuitting, destroy };
