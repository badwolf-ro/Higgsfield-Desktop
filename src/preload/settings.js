// Bridge for the Settings window (sandboxed preload: only 'electron' can be required).
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  const handler = (_e, value) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('settingsApi', {
  getState: () => ipcRenderer.invoke('settings:get-state'),
  update: patch => ipcRenderer.invoke('settings:update', patch),
  setHotkey: (actionId, accelerator) =>
    ipcRenderer.invoke('settings:set-hotkey', String(actionId), String(accelerator || '')),
  resetHotkeys: () => ipcRenderer.invoke('settings:reset-hotkeys'),
  chooseDownloadFolder: () => ipcRenderer.invoke('settings:choose-folder'),
  openDownloadFolder: () => ipcRenderer.send('settings:open-folder'),
  setRecording: on => ipcRenderer.send('settings:recording', !!on),
  onChanged: cb => listen('settings:changed', cb),
  onShowSection: cb => listen('settings:show-section', cb),
  workspace: (op, args) => ipcRenderer.invoke('settings:workspace', String(op), args || {}),
  onWorkspacesChanged: cb => listen('settings:workspaces-changed', cb),
  project: (op, args) => ipcRenderer.invoke('settings:project', String(op), args || {}),
  onProjectsChanged: cb => listen('settings:projects-changed', cb),
});
