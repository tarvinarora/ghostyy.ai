const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ghost', {
  getData: () => ipcRenderer.invoke('get-data'),
  mutate: (action) => ipcRenderer.invoke('mutate', action),
  onData: (cb) => ipcRenderer.on('data-changed', (_e, p) => cb(p)),

  // figure window
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  getPos: () => ipcRenderer.invoke('figure-pos'),
  move: (x, y) => ipcRenderer.send('figure-move', { x, y }),
  moveEnd: () => ipcRenderer.send('figure-move-end'),
  click: () => ipcRenderer.send('figure-click'),
  menu: () => ipcRenderer.send('figure-menu'),
  onReminder: (cb) => ipcRenderer.on('reminder', (_e, p) => cb(p)),
  onReminderClear: (cb) => ipcRenderer.on('reminder-clear', () => cb()),
  onRefreshAnim: (cb) => ipcRenderer.on('refresh-anim', () => cb()),
  onThirsty: (cb) => ipcRenderer.on('thirsty', () => cb()),
  drank: () => ipcRenderer.send('drank'),
  dropItems: (items) => ipcRenderer.send('drop-items', items),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onSay: (cb) => ipcRenderer.on('say', (_e, p) => cb(p)),
  onFocusDone: (cb) => ipcRenderer.on('focus-done', () => cb()),

  // panel window
  hidePanel: () => ipcRenderer.send('panel-hide'),
  remindNow: () => ipcRenderer.send('remind-now'),
  setGhostHidden: (hidden) => ipcRenderer.send('set-ghost-hidden', hidden),
  setSync: (mode) => ipcRenderer.invoke('set-sync', mode),
  onPanelOpened: (cb) => ipcRenderer.on('panel-opened', () => cb()),
  taskMenu: (info) => ipcRenderer.invoke('task-menu', info),
  breakDown: (listId, taskId) => ipcRenderer.invoke('break-down', { listId, taskId }),
  openLink: (link) => ipcRenderer.send('open-link', link),
  toggleFocus: () => ipcRenderer.send('toggle-focus'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
});
