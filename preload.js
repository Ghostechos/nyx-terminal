'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, ...args) => cb(...args));

contextBridge.exposeInMainWorld('nyx', {
  init: () => ipcRenderer.invoke('app:init'),

  // Terminaux
  createPty: (opts) => ipcRenderer.invoke('pty:create', opts),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData: on('pty:data'),
  onExit: on('pty:exit'),

  // Paramètres
  onSettingsChanged: on('settings:changed'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  // Session, fenêtres
  saveSession: (state) => ipcRenderer.send('session:update', state),
  newWindow: () => ipcRenderer.send('window:new'),
  closeWindow: () => ipcRenderer.send('window:close'),
  setOverlay: (color, symbolColor) => ipcRenderer.send('window:overlay', color, symbolColor),
  toggleQuake: () => ipcRenderer.send('quake:toggle'),
  onQuakeShow: on('quake:show'),
  onQuakeHide: on('quake:hide'),

  // Système
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  paste: () => ipcRenderer.invoke('clipboard:read'),
  openExternal: (url) => ipcRenderer.send('open:external', url),
  openFolder: (p) => ipcRenderer.send('shell:open-folder', p),
  pickFile: (opts) => ipcRenderer.invoke('file:pick', opts),
  pickBackground: () => ipcRenderer.invoke('background:pick'),
  notify: (n) => ipcRenderer.send('notify', n),
  onFocusPane: on('focus-pane'),
  onToast: on('toast')
});
