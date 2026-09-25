// Per-tab viewport. Chromium zoom is shared by every tab on the same site, so
// zooming one Higgsfield tab would zoom them all. Instead each tab gets its own
// emulated viewport through the DevTools Protocol: a panel narrower than the
// minimum page width is laid out at that width and scaled down, so the site
// keeps its desktop layout, and the tab's own zoom works the same way.
// Clicks and scrolling map correctly through the emulated scale.
const cdp = require('./cdp');

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

let settings = null;
let onInfo = () => {};
let onZoomRequest = () => {};
const tabs = new Map(); // webContentsId -> { contents, width, height, zoom, applied }

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function apply(tab) {
  if (!tab.width || !tab.height || tab.contents.isDestroyed()) return;
  const { fitDesktop, minPageWidth } = settings.get().layout;
  let scale = tab.zoom;
  let fitted = false;
  if (fitDesktop && minPageWidth > 0 && tab.width / scale < minPageWidth) {
    scale = tab.width / minPageWidth;
    fitted = true;
  }
  scale = clamp(scale, MIN_SCALE, MAX_SCALE);

  const key = `${tab.width}x${tab.height}@${scale.toFixed(4)}`;
  if (tab.applied === key) return;
  tab.applied = key;

  let dbg;
  try { dbg = cdp.attach(tab.contents); } catch { tab.applied = null; return; }
  const done = Math.abs(scale - 1) < 0.001
    ? dbg.sendCommand('Emulation.clearDeviceMetricsOverride')
    : dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: Math.round(tab.width / scale),
      height: Math.round(tab.height / scale),
      deviceScaleFactor: 0, // keep the screen's real pixel density
      mobile: false,
      scale,
    });
  done.catch(() => { tab.applied = null; });
  onInfo({ webContentsId: tab.contents.id, zoom: scale, fitted });
}

// options: { settings, onInfo({ webContentsId, zoom, fitted }), onZoomRequest(webContentsId, 'in'|'out') }
function init(options) {
  settings = options.settings;
  if (options.onInfo) onInfo = options.onInfo;
  if (options.onZoomRequest) onZoomRequest = options.onZoomRequest;
}

// Called for every tab's webContents.
function watch(contents) {
  const tab = { contents, width: 0, height: 0, zoom: 1, applied: null };
  tabs.set(contents.id, tab);

  // Keep Chromium's shared per-site zoom at 100%; per-tab zoom is emulated.
  contents.on('did-finish-load', () => {
    if (contents.getZoomFactor() !== 1) contents.setZoomFactor(1);
  });
  // A new page can come up in a fresh renderer; make sure it gets the viewport.
  contents.on('did-navigate', () => {
    tab.applied = null;
    apply(tab);
  });
  // Ctrl + mouse wheel
  contents.on('zoom-changed', (_event, direction) => onZoomRequest(contents.id, direction));
  contents.once('destroyed', () => tabs.delete(contents.id));
}

// From the tab UI: the tab's on-screen size in CSS pixels and its own zoom.
function update(webContentsId, { width, height, zoom }) {
  const tab = tabs.get(webContentsId);
  if (!tab || !(width > 0) || !(height > 0)) return;
  tab.width = Math.round(width);
  tab.height = Math.round(height);
  tab.zoom = clamp(Number(zoom) || 1, MIN_SCALE, MAX_SCALE);
  apply(tab);
}

// After the layout settings change.
function refreshAll() {
  for (const tab of tabs.values()) {
    tab.applied = null;
    apply(tab);
  }
}

module.exports = { init, watch, update, refreshAll };
