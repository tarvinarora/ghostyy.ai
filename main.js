// Ghost Assistant — main process
const {
  app, BrowserWindow, ipcMain, screen, Menu, Tray, Notification, nativeImage, globalShortcut, dialog,
} = require('electron');
const path = require('path');
const { Store, findGoogleDrives, pickDrive, SYNC_FOLDER_NAME, SYNC_ACCOUNT } = require('./store');

const FIGURE_W = 200;
const FIGURE_H = 230;
const PANEL_W = 420;
const PANEL_H = 600;
// Keep the figurine animating even when macOS thinks its transparent window
// is covered (e.g. while a notification slides in); otherwise its animations
// freeze mid-frame — mid-blink, mid-wiggle.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const GHOST_SHORTCUT = 'CommandOrControl+Shift+G';
const PANEL_SHORTCUT = 'CommandOrControl+Shift+L';

let figureWin = null;
let panelWin = null;
let tray = null;
let store = null;

const pendingCount = () => store.pendingCount();
const payload = () => ({
  data: store.view(),
  pending: pendingCount(),
  ghostHidden: !!store.local.ghostHidden,
  sync: store.syncStatus(),
});

function broadcast() {
  const p = payload();
  for (const w of [figureWin, panelWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('data-changed', p);
  }
  if (tray) tray.setTitle(p.pending ? ` ${p.pending}` : '');
}

// ---------- windows ----------
function defaultFigurePos() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - FIGURE_W - 24, y: workArea.y + workArea.height - FIGURE_H - 24 };
}

function createFigure() {
  let pos = store.local.figurePos || defaultFigurePos();
  // If the saved spot is off-screen (e.g. external monitor unplugged), reset it.
  const onScreen = screen.getAllDisplays().some(({ workArea: w }) =>
    pos.x + FIGURE_W / 2 >= w.x && pos.x + FIGURE_W / 2 <= w.x + w.width &&
    pos.y + FIGURE_H / 2 >= w.y && pos.y + FIGURE_H / 2 <= w.y + w.height);
  if (!onScreen) pos = defaultFigurePos();

  figureWin = new BrowserWindow({
    width: FIGURE_W,
    height: FIGURE_H,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  figureWin.setAlwaysOnTop(true, 'floating');
  figureWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Transparent parts of the window let clicks fall through to whatever is behind.
  figureWin.setIgnoreMouseEvents(true, { forward: true });
  figureWin.loadFile(path.join(__dirname, 'figure.html'));
  figureWin.once('ready-to-show', () => { if (!store.local.ghostHidden) figureWin.showInactive(); });
  figureWin.on('show', () => figureWin.webContents.send('refresh-anim'));
  figureWin.on('closed', () => { figureWin = null; });
}

function setGhostHidden(hidden) {
  store.local.ghostHidden = !!hidden;
  store.saveLocal();
  if (figureWin) hidden ? figureWin.hide() : figureWin.showInactive();
  broadcast();
}

function placePanel() {
  if (!panelWin) return;
  let anchor;
  if (figureWin && figureWin.isVisible()) {
    const [fx, fy] = figureWin.getPosition();
    anchor = { x: fx - PANEL_W + 30, y: fy + FIGURE_H - PANEL_H, alt: fx + FIGURE_W - 30, fx, fy };
  } else if (tray) {
    // Ghost hidden: drop the panel down from the menu-bar icon.
    const b = tray.getBounds();
    anchor = { x: b.x + b.width / 2 - PANEL_W / 2, y: b.y + b.height + 4, fx: b.x, fy: b.y };
  } else {
    anchor = { x: 100, y: 100, fx: 100, fy: 100 };
  }
  const wa = screen.getDisplayNearestPoint({ x: Math.round(anchor.fx), y: Math.round(anchor.fy) }).workArea;
  let { x, y } = anchor;
  if (anchor.alt !== undefined && x < wa.x + 8) x = anchor.alt;
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - PANEL_W - 8));
  y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - PANEL_H - 8));
  panelWin.setPosition(Math.round(x), Math.round(y));
}

function createPanel() {
  panelWin = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    minWidth: 340,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  panelWin.setAlwaysOnTop(true, 'floating');
  panelWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWin.loadFile(path.join(__dirname, 'panel.html'));
  panelWin.on('closed', () => { panelWin = null; });
}

function openPanel() {
  if (!panelWin) createPanel();
  placePanel();
  panelWin.show();
  panelWin.focus();
  panelWin.webContents.send('panel-opened');
  if (figureWin) figureWin.webContents.send('reminder-clear');
}

function togglePanel() {
  if (panelWin && panelWin.isVisible()) panelWin.hide();
  else openPanel();
}

// ---------- reminders ----------
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fireReminder(label) {
  const n = pendingCount();
  const body = n
    ? `You have ${n} open task${n === 1 ? '' : 's'}. Take a minute to check off and update your lists.`
    : 'Your lists are clear! Anything new to add?';
  if (Notification.isSupported()) {
    const notif = new Notification({ title: `${label} check-in`, body, silent: false });
    notif.on('click', openPanel);
    notif.show();
  }
  if (figureWin) figureWin.webContents.send('reminder', { label, pending: n });
  // Belt and braces: nudge the figurine back to its idle animation afterwards.
  setTimeout(() => figureWin?.webContents.send('refresh-anim'), 4000);
}

function labelFor(time) {
  const h = parseInt(time.split(':')[0], 10);
  if (h < 12) return 'Morning';
  if (h < 17) return 'Midday';
  return 'Evening';
}

function checkReminders() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayKey();
  const last = store.local.lastReminders || (store.local.lastReminders = {});
  for (const t of store.view().settings.reminderTimes) {
    const [h, m] = t.split(':').map(Number);
    const tMin = h * 60 + m;
    // Fire if we're within 30 min after the slot and haven't fired today
    // (covers the Mac waking up from sleep just after a slot).
    if (nowMin >= tMin && nowMin - tMin <= 30 && last[t] !== today) {
      last[t] = today;
      store.saveLocal();
      fireReminder(labelFor(t));
    }
  }
}

// ---------- sync ----------
async function setSync(mode) {
  if (mode === 'off') {
    store.setSyncDir(null);
  } else if (mode === 'gdrive') {
    const drives = findGoogleDrives();
    if (!drives.length) {
      return { error: `Google Drive for desktop isn’t installed or signed in on this Mac. Install it from google.com/drive/download, sign in${SYNC_ACCOUNT ? ` as ${SYNC_ACCOUNT}` : ''}, then try again.` };
    }
    const drive = pickDrive(drives);
    if (!drive) {
      return { error: `Google Drive on this Mac is signed in as ${drives.map((d) => d.account).join(', ')}, not ${SYNC_ACCOUNT}. In Google Drive for desktop, open Settings → Add another account, sign in as ${SYNC_ACCOUNT}, then try again.` };
    }
    store.setSyncDir(path.join(drive.path, SYNC_FOLDER_NAME));
  } else if (mode === 'folder') {
    const wasVisible = panelWin?.isVisible();
    const res = await dialog.showOpenDialog(panelWin, {
      title: 'Choose a synced folder (Dropbox, Google Drive, …)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (wasVisible) openPanel();
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    store.setSyncDir(res.filePaths[0]);
  }
  return { ok: true };
}

// ---------- menus ----------
function buildMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  const hidden = !!store.local.ghostHidden;
  return Menu.buildFromTemplate([
    { label: 'Open task lists', accelerator: PANEL_SHORTCUT, click: openPanel },
    { label: 'Remind me now', click: () => fireReminder('Quick') },
    { type: 'separator' },
    { label: hidden ? 'Show figurine' : 'Hide figurine', accelerator: GHOST_SHORTCUT, click: () => setGhostHidden(!hidden) },
    {
      label: 'Reset figurine position',
      click: () => {
        store.local.figurePos = null;
        store.saveLocal();
        const p = defaultFigurePos();
        figureWin?.setPosition(p.x, p.y);
        if (hidden) setGhostHidden(false);
      },
    },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: login,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit Ghost Assistant', click: () => app.quit() },
  ]);
}

function createTray() {
  // trayTemplate@2x.png is picked up automatically on Retina screens.
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  if (!img.isEmpty()) img.setTemplateImage(true);
  tray = new Tray(img);
  if (img.isEmpty()) tray.setTitle('👻');
  tray.setToolTip('Ghost Assistant');
  tray.on('click', togglePanel);
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
}

// ---------- IPC ----------
ipcMain.handle('get-data', () => payload());

ipcMain.on('set-ignore-mouse', (_e, ignore) => {
  figureWin?.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('figure-move', (_e, { x, y }) => {
  if (!figureWin) return;
  figureWin.setPosition(Math.round(x), Math.round(y));
  if (panelWin?.isVisible()) placePanel();
});
ipcMain.on('figure-move-end', () => {
  if (!figureWin) return;
  const [x, y] = figureWin.getPosition();
  store.local.figurePos = { x, y };
  store.saveLocal();
});
ipcMain.handle('figure-pos', () => figureWin?.getPosition() || [0, 0]);
ipcMain.on('figure-click', togglePanel);
ipcMain.on('figure-menu', () => buildMenu().popup({ window: figureWin }));
ipcMain.on('panel-hide', () => panelWin?.hide());
ipcMain.on('remind-now', () => fireReminder('Quick'));
ipcMain.on('set-ghost-hidden', (_e, hidden) => setGhostHidden(hidden));
ipcMain.handle('set-sync', (_e, mode) => setSync(mode));

ipcMain.handle('mutate', (_e, action) => {
  store.mutate(action);
  broadcast();
  return payload();
});

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openPanel);

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    store = new Store({ localDir: app.getPath('userData'), onChange: broadcast });
    store.load();
    createFigure();
    createPanel();
    createTray();
    broadcast();

    globalShortcut.register(GHOST_SHORTCUT, () => setGhostHidden(!store.local.ghostHidden));
    globalShortcut.register(PANEL_SHORTCUT, togglePanel);

    checkReminders();
    setInterval(checkReminders, 20 * 1000);
  });

  app.on('before-quit', () => { store?.flush(); store?.saveLocal(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', (e) => e.preventDefault());
}
