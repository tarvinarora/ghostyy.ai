// Ghost Assistant — main process
const {
  app, BrowserWindow, ipcMain, screen, Menu, Tray, Notification, nativeImage, globalShortcut, dialog, shell,
} = require('electron');
const path = require('path');
const { execFileSync } = require('child_process');
const { Store, findGoogleDrives, pickDrive, SYNC_FOLDER_NAME, SYNC_ACCOUNT } = require('./store');
const ai = require('./ai');
const { Updater } = require('./updater');

// Electron ships its own time zone data, which can lag behind macOS: Vancouver's
// move to permanent UTC-7 left every time here an hour behind the Mac's clock.
// So trust macOS. Runs before any window opens, so their pages inherit it too.
function matchSystemClock() {
  try {
    const m = execFileSync('/bin/date', ['+%z'], { encoding: 'utf8' }).trim().match(/^([+-])(\d\d)00$/);
    if (!m) return; // Etc/GMT zones only come in whole hours
    const hours = (m[1] === '-' ? -1 : 1) * Number(m[2]);
    if (hours * 60 === -new Date().getTimezoneOffset()) return;
    process.env.TZ = `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`; // these names read backwards
  } catch {}
}
matchSystemClock();

const BUNDLE_ID = 'com.tarvinarora.ghostassistant';
const FIGURE_W = 200;
// Mostly transparent headroom so a morning plan fits in the speech bubble.
const FIGURE_H = 340;
const OLD_FIGURE_H = 230;
// Where the figurine sits inside its window, for spotting drags from other apps.
const GHOST_RECT = { left: 44, right: 156, top: FIGURE_H - 142, bottom: FIGURE_H - 14 };
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
let updater = null;
let aiError = '';

const pendingCount = () => store.pendingCount();
const payload = () => ({
  data: store.view(),
  pending: pendingCount(),
  ghostHidden: !!store.local.ghostHidden,
  sync: store.syncStatus(),
  focusEndsAt: focusActive() ? store.local.focusEndsAt : null,
  plan: store.local.plan?.day === todayKey() ? store.local.plan.picks : [],
  ai: { hasKey: !!apiKey(), error: aiError },
  update: updater ? updater.state : { status: 'idle' },
  appVersion: app.getVersion(),
});

const apiKey = () => ai.findKey([__dirname, app.getPath('userData')]);
const focusActive = () => (store.local.focusEndsAt || 0) > Date.now();

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
  // The window grew upward: keep a figurine saved under the old height where it was.
  if (store.local.figurePos && !store.local.figureTall) {
    store.local.figurePos.y -= FIGURE_H - OLD_FIGURE_H;
  }
  store.local.figureTall = true;
  store.saveLocal();
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
  figureWin.webContents.on('will-navigate', (e) => e.preventDefault()); // a stray drop must not replace the page
}

// macOS only offers a drag to windows that accept the mouse, and a drag from
// another app sends this window no mouse-moves to react to. So main watches the
// cursor too, and opens the figurine up while the cursor is over it.
let rendererIgnore = true;
let appliedIgnore = true;
function applyIgnore() {
  if (!figureWin || !figureWin.isVisible()) return;
  const c = screen.getCursorScreenPoint();
  const b = figureWin.getBounds();
  const over = c.x >= b.x + GHOST_RECT.left && c.x <= b.x + GHOST_RECT.right &&
    c.y >= b.y + GHOST_RECT.top && c.y <= b.y + GHOST_RECT.bottom;
  const ignore = rendererIgnore && !over;
  if (ignore === appliedIgnore) return;
  appliedIgnore = ignore;
  figureWin.setIgnoreMouseEvents(ignore, { forward: true });
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
  panelWin.webContents.on('will-navigate', (e) => e.preventDefault());
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

function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', openPanel);
  n.show();
}

// Speaks through the figurine: { title, groups: [{ heading, items, more }] }.
function say(bubble, ms = 20 * 60 * 1000) {
  if (figureWin) figureWin.webContents.send('say', { ...bubble, ms });
  setTimeout(() => figureWin?.webContents.send('refresh-anim'), 4000);
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

async function fireMorningPlan() {
  store.local.lastPlanDay = todayKey();
  store.saveLocal();
  if (!store.pendingCount()) return fireReminder('Morning');
  const { picks, error } = await ai.morningPlan({ apiKey: apiKey(), open: store.openTasks() });
  aiError = error || '';
  store.local.plan = { day: todayKey(), picks };
  store.saveLocal();
  broadcast();
  if (!picks.length) return fireReminder('Morning');
  notify('Your morning plan', picks.map((p, i) => `${i + 1}. ${p.text}`).join('\n'));
  say({ title: 'Do these first', groups: [{ items: picks.map((p) => ({ text: p.text, why: p.why })) }] });
}

function fireRecap() {
  store.local.lastRecapDay = todayKey();
  store.saveLocal();
  const { finished, carry } = store.recap(startOfToday());
  const title = finished.length ? `You finished ${finished.length} today` : 'Nothing checked off today';
  const list = (names) => ({ items: names.slice(0, 3).map((text) => ({ text })), more: Math.max(0, names.length - 3) });
  const groups = [];
  if (finished.length) groups.push({ heading: 'Done', ...list(finished) });
  if (carry.length) groups.push({ heading: 'Carrying over', ...list(carry) });
  if (!carry.length) groups.push({ heading: 'Nothing carries over', items: [] });
  notify('Evening recap', [
    finished.length ? `Done: ${finished.join(', ')}` : 'Nothing checked off today.',
    carry.length ? `Carrying over: ${carry.join(', ')}` : 'Nothing carries over to tomorrow.',
  ].join('\n'));
  say({ title, groups });
}

function fireCheckIn(label) {
  const today = todayKey();
  if (label === 'Morning' && store.local.lastPlanDay !== today) return fireMorningPlan();
  if (label === 'Evening' && store.local.lastRecapDay !== today) return fireRecap();
  return fireReminder(label);
}

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
  // Hold check-ins during focus. They fire afterwards: the 30-minute catch-up
  // window below is longer than a focus session.
  if (focusActive()) return;
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
      fireCheckIn(labelFor(t));
    }
  }
}

// ---------- due times ----------
const NUDGE_BEFORE_MIN = 15;
const NUDGE_LATE_MIN = 30; // still nudge if the Mac wakes just after a task was due

function checkDue() {
  const now = Date.now();
  const seen = store.local.dueNudged || (store.local.dueNudged = {});
  let changed = false;
  for (const t of store.openTasks()) {
    if (!t.dueAt || seen[t.id] === t.dueAt) continue; // a new due time nudges again
    if (now < t.dueAt - NUDGE_BEFORE_MIN * 60000 || now > t.dueAt + NUDGE_LATE_MIN * 60000) continue;
    seen[t.id] = t.dueAt;
    changed = true;
    const min = Math.round((t.dueAt - now) / 60000);
    const when = min > 0 ? `Due in ${min} min` : min === 0 ? 'Due now' : `${-min} min overdue`;
    notify(when, t.text);
    say({ title: when, groups: [{ items: [{ text: t.text }] }] });
  }
  for (const [id, due] of Object.entries(seen)) {
    if (due < now - 2 * 86400000) { delete seen[id]; changed = true; }
  }
  if (changed) store.saveLocal();
}

// ---------- focus timer ----------
const FOCUS_MIN = 25;
let focusTimer = null;

function armFocus() {
  clearTimeout(focusTimer);
  if (focusActive()) focusTimer = setTimeout(finishFocus, store.local.focusEndsAt - Date.now());
  else if (store.local.focusEndsAt) { store.local.focusEndsAt = null; store.saveLocal(); }
}

function startFocus() {
  store.local.focusEndsAt = Date.now() + FOCUS_MIN * 60000;
  store.saveLocal();
  armFocus();
  broadcast();
}

function stopFocus() {
  clearTimeout(focusTimer);
  store.local.focusEndsAt = null;
  store.saveLocal();
  broadcast();
}

function finishFocus() {
  stopFocus();
  notify('Focus session done', `That’s ${FOCUS_MIN} minutes. Stretch and take a break.`);
  figureWin?.webContents.send('focus-done');
}
const toggleFocus = () => (focusActive() ? stopFocus() : startFocus());

// ---------- dropping things on the figurine ----------
function validLink(link) {
  if (typeof link !== 'string') return null;
  if (/^https?:\/\//i.test(link) || path.isAbsolute(link)) return link;
  return null;
}

function addDropped(items) {
  const { lists } = store.view();
  const list = lists.find((l) => /^today$/i.test(l.name)) || lists[0];
  if (!list || !Array.isArray(items)) return;
  const added = [];
  for (const item of items.slice(0, 20)) {
    const text = String(item?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) continue;
    store.mutate({ type: 'add-task', listId: list.id, text, link: validLink(item.link) });
    added.push(text);
  }
  if (!added.length) return;
  broadcast();
  figureWin?.webContents.send('say', {
    title: `Added to ${list.name}`,
    groups: [{ items: added.slice(0, 3).map((text) => ({ text })), more: Math.max(0, added.length - 3) }],
    ms: 4000,
  });
}

// ---------- water breaks ----------
// Not a tracker: the ghost gets thirsty every WATER_EVERY_MIN minutes and stays
// that way until you click its glass, which restarts the countdown.
const WATER_EVERY_MIN = 60;
let lastDrink = Date.now();
let thirsty = false;

function fireThirsty() {
  const canClick = !!figureWin && !store.local.ghostHidden;
  if (Notification.isSupported()) {
    new Notification({
      title: 'Water break',
      body: canClick ? 'Your ghost is thirsty. Click the glass to have a drink together.' : 'Time for a glass of water.',
      silent: true,
    }).show();
  }
  if (canClick) {
    thirsty = true;
    figureWin.webContents.send('thirsty');
  } else {
    lastDrink = Date.now(); // figurine hidden, nothing to click: just remind again later
  }
}

function checkWater() {
  if (!thirsty && !focusActive() && Date.now() - lastDrink >= WATER_EVERY_MIN * 60 * 1000) fireThirsty();
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
  const update = updater?.state || {};
  return Menu.buildFromTemplate([
    { label: 'Open task lists', accelerator: PANEL_SHORTCUT, click: openPanel },
    {
      label: focusActive() ? 'Stop focus timer' : `Start ${FOCUS_MIN}-minute focus`,
      click: toggleFocus,
    },
    { type: 'separator' },
    { label: 'Plan my day now', click: fireMorningPlan },
    { label: 'Recap my day now', click: fireRecap },
    { label: 'Remind me now', click: () => fireReminder('Quick') },
    { label: 'Offer water now', click: () => { if (!thirsty) fireThirsty(); } },
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
    update.status === 'ready'
      ? { label: `Restart to update to ${update.version}`, click: () => updater.installAndRestart() }
      : { label: 'Check for updates', enabled: !!app.isPackaged, click: () => updater.check({ manual: true }) },
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
  rendererIgnore = ignore;
  applyIgnore();
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
ipcMain.on('drank', () => { thirsty = false; lastDrink = Date.now(); });
ipcMain.on('set-ghost-hidden', (_e, hidden) => setGhostHidden(hidden));
ipcMain.handle('set-sync', (_e, mode) => setSync(mode));
ipcMain.on('drop-items', (_e, items) => addDropped(items));
ipcMain.on('toggle-focus', toggleFocus);
ipcMain.handle('check-updates', () => updater.check({ manual: true }));
ipcMain.on('restart-to-update', () => updater.installAndRestart());

ipcMain.on('open-link', (_e, link) => {
  if (/^https?:\/\//i.test(link)) shell.openExternal(link);
  else if (path.isAbsolute(link)) shell.showItemInFolder(link); // reveal, never run, a dropped file
});

// Resolves with the chosen action, or null if the menu was dismissed.
ipcMain.handle('task-menu', (_e, { link, due, done, steps }) => new Promise((resolve) => {
  const pick = (action) => ({ click: () => resolve(action) });
  const template = [];
  if (!done && !steps) template.push({ label: 'Break it down', ...pick('break') });
  if (!done) template.push({ label: due ? 'Change due time…' : 'Set due time…', ...pick('due') });
  if (due) template.push({ label: 'Remove due time', ...pick('clear-due') });
  if (link) template.push({ label: /^https?:/i.test(link) ? 'Open link' : 'Show in Finder', ...pick('open') });
  if (template.length) template.push({ type: 'separator' });
  template.push({ label: 'Edit', ...pick('edit') }, { label: 'Delete', ...pick('delete') });
  // The close callback can fire before the click, so give the click time to land.
  Menu.buildFromTemplate(template).popup({ window: panelWin, callback: () => setTimeout(() => resolve(null), 150) });
}));

ipcMain.handle('break-down', async (_e, { listId, taskId }) => {
  const list = store.view().lists.find((l) => l.id === listId);
  const task = list?.tasks.find((t) => t.id === taskId);
  if (!task) return { error: 'That task is gone.' };
  try {
    const steps = await ai.breakDown({ apiKey: apiKey(), text: task.text, listName: list.name });
    aiError = '';
    store.mutate({ type: 'add-steps', listId, taskId, steps });
    broadcast();
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

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
    const feed = process.env.GHOST_UPDATE_FEED; // test feed on this Mac only
    updater = new Updater({
      app,
      bundleId: BUNDLE_ID,
      feed: feed && feed.startsWith('http://127.0.0.1') ? feed : undefined,
      onChange: (state) => {
        broadcast();
        if (state.status === 'ready') notify('Update ready', `Right-click the figurine and restart to get version ${state.version}.`);
      },
    });
    armFocus();
    createFigure();
    createPanel();
    createTray();
    broadcast();

    globalShortcut.register(GHOST_SHORTCUT, () => setGhostHidden(!store.local.ghostHidden));
    globalShortcut.register(PANEL_SHORTCUT, togglePanel);

    // Anything due right now has to wait for the figurine, or its bubble is lost.
    figureWin.webContents.once('did-finish-load', () => { checkReminders(); checkDue(); });
    setInterval(() => { checkReminders(); checkDue(); checkWater(); }, 20 * 1000);
    setInterval(applyIgnore, 100);
    updater.start();
  });

  app.on('before-quit', () => { store?.flush(); store?.saveLocal(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', (e) => e.preventDefault());
}
