// Application menu. Shortcuts are shown here but handled by hotkeys.js
// (registerAccelerator: false), so user-configured bindings apply everywhere.
const { Menu } = require('electron');
const { SECTIONS, byId } = require('../shared/actions');

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// opts: { dispatch(id), accelerator(id), sendCommand(cmd), openSettings(section), clearAllData(), tabs,
//         workspaces: [{ id, name, tabCount }], loadWorkspace(id), locked }
function build(opts) {
  const { dispatch, accelerator, sendCommand, openSettings, clearAllData, tabs, workspaces, loadWorkspace, locked } = opts;

  const action = (id, extra) => ({
    label: byId[id].label,
    accelerator: accelerator(id),
    registerAccelerator: false,
    click: () => dispatch(id),
    ...extra,
  });
  const sep = { type: 'separator' };

  const openTabItems = tabs.length
    ? tabs.map(t => ({
      label: truncate(t.title || 'Higgsfield', 48).replace(/&/g, '&&'),
      type: 'radio',
      checked: t.active,
      enabled: t.webContentsId != null,
      click: () => sendCommand({ type: 'focusTab', webContentsId: t.webContentsId }),
    }))
    : [{ label: 'No open tabs', enabled: false }];

  const workspaceItems = workspaces.length
    ? workspaces.map((w, i) => ({
      label: `${i < 9 ? `&${i + 1}  ` : ''}${truncate(w.name, 48).replace(/&/g, '&&')}`,
      sublabel: `${w.tabCount} ${w.tabCount === 1 ? 'tab' : 'tabs'}`,
      accelerator: i < 9 ? accelerator('workspace:' + (i + 1)) : undefined,
      registerAccelerator: false,
      click: () => loadWorkspace(w.id),
    }))
    : [{ label: 'No saved workspaces yet', enabled: false }];

  return Menu.buildFromTemplate([
    {
      label: '&File',
      submenu: [
        action('newTab', { label: 'New Tab' }),
        action('reopenClosedTab', { label: 'Reopen Closed Tab' }),
        action('closeTab', { label: 'Close Tab' }),
        sep,
        action('openDownloads', { label: 'Open Downloads Folder' }),
        sep,
        action('openSettings', { label: 'Settings…' }),
        action('openHotkeys', { label: 'Hotkeys…' }),
        sep,
        action('clearCache', { label: 'Clear Cache' }),
        { label: 'Clear All Data and Sign Out…', click: clearAllData },
        sep,
        { role: 'quit', label: 'Quit Higgsfield' },
      ],
    },
    { role: 'editMenu', label: '&Edit' },
    {
      label: '&View',
      submenu: [
        action('reload', { label: 'Reload' }),
        action('hardReload', { label: 'Reload Without Cache' }),
        sep,
        action('zoomIn', { label: 'Zoom In' }),
        action('zoomOut', { label: 'Zoom Out' }),
        action('resetZoom', { label: 'Reset Zoom' }),
        sep,
        action('toggleFullscreen', { label: 'Full Screen' }),
        sep,
        action('devTools', { label: 'Developer Tools for This Tab' }),
      ],
    },
    {
      label: '&Tabs',
      submenu: [
        action('back', { label: 'Back' }),
        action('forward', { label: 'Forward' }),
        action('home', { label: 'Home' }),
        sep,
        action('newTab', { label: 'New Tab' }),
        {
          label: 'Open in New Tab',
          submenu: SECTIONS.map(s => action('open:' + s.id, { label: s.label })),
        },
        action('closeTab', { label: 'Close Tab' }),
        sep,
        action('nextTab', { label: 'Next Tab' }),
        action('prevTab', { label: 'Previous Tab' }),
        sep,
        action('splitRight', { label: 'Split Right' }),
        action('splitDown', { label: 'Split Down' }),
        sep,
        ...openTabItems,
      ],
    },
    {
      label: '&Workspaces',
      submenu: [
        ...workspaceItems,
        sep,
        action('saveWorkspace', { label: 'Save Workspace…' }),
        { label: 'Manage Workspaces…', click: () => openSettings('workspaces') },
        sep,
        action('toggleLock', { label: 'Lock Layout', type: 'checkbox', checked: locked }),
        { label: 'Reset Layout', click: () => sendCommand({ type: 'resetLayout' }) },
      ],
    },
  ]);
}

module.exports = { build };
