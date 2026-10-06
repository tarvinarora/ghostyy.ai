// Ghost Assistant — storage + sync.
// Tasks live in tasks.json, either locally or in a synced folder (iCloud Drive,
// Dropbox, …). Every list/task carries an `updatedAt` stamp, and deletions are
// kept as tombstones, so two Macs editing at the same time merge item-by-item
// instead of overwriting each other.
const fs = require('fs');
const path = require('path');
const os = require('os');

const TOMBSTONE_TTL = 30 * 24 * 3600 * 1000; // forget deletions after 30 days
const FILE_RE = /^tasks(?: \d+|\s?\(\d+\)|\s?\(.*conflict.*\))?\.json$/i; // tasks.json + Drive/Dropbox conflict copies

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const CLOUD_STORAGE = path.join(os.homedir(), 'Library', 'CloudStorage');
const SYNC_FOLDER_NAME = 'Ghost Assistant';
// Optional: pin syncing to one Google account by putting
// {"syncAccount": "you@example.com"} in config.local.json (gitignored).
// If unset, the first Google Drive account signed in on this Mac is used.
const SYNC_ACCOUNT = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.local.json'), 'utf8'));
    return String(cfg.syncAccount || '').trim().toLowerCase();
  } catch { return ''; }
})();
const pickDrive = (drives) => (SYNC_ACCOUNT ? drives.find((d) => d.account.toLowerCase() === SYNC_ACCOUNT) : drives[0]);

// Finds Google Drive for desktop's "My Drive" folder(s) on this Mac.
function findGoogleDrives() {
  const out = [];
  try {
    for (const name of fs.readdirSync(CLOUD_STORAGE)) {
      if (!name.startsWith('GoogleDrive-')) continue;
      const root = path.join(CLOUD_STORAGE, name);
      let sub = 'My Drive';
      try {
        const kids = fs.readdirSync(root);
        // "My Drive" is localized in some languages; take the first non-shared folder.
        if (!kids.includes('My Drive')) sub = kids.find((k) => !/^(\.|Shared|Other computers)/i.test(k)) || 'My Drive';
      } catch {}
      out.push({ account: name.slice('GoogleDrive-'.length), path: path.join(root, sub) });
    }
  } catch {}
  // Older Drive versions mounted as a volume.
  const legacy = '/Volumes/GoogleDrive/My Drive';
  if (!out.length && fs.existsSync(legacy)) out.push({ account: 'Google Drive', path: legacy });
  return out;
}
const isGoogleDrivePath = (dir) => !!dir && (dir.startsWith(CLOUD_STORAGE + path.sep + 'GoogleDrive-') || dir.startsWith('/Volumes/GoogleDrive'));

function defaultShared() {
  const now = Date.now();
  return {
    version: 2,
    lists: ['Today', 'Work', 'Personal'].map((name, i) => ({
      id: uid(), name, updatedAt: now - 3 + i, tasks: [],
    })),
    settings: { reminderTimes: ['09:00', '13:00', '18:00'], skin: 'classic', updatedAt: 0 },
  };
}

// Accepts v1 files (no timestamps) and anything partial.
function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const lists = Array.isArray(d.lists) ? d.lists : [];
  return {
    version: 2,
    lists: lists.filter((l) => l && l.id).map((l) => ({
      id: l.id,
      name: String(l.name ?? 'Untitled'),
      updatedAt: l.updatedAt || 0,
      ...(l.deleted ? { deleted: true } : {}),
      tasks: (Array.isArray(l.tasks) ? l.tasks : []).filter((t) => t && t.id).map((t) => ({
        id: t.id,
        text: String(t.text ?? ''),
        done: !!t.done,
        createdAt: t.createdAt || 0,
        doneAt: t.doneAt || null,
        updatedAt: t.updatedAt || t.doneAt || t.createdAt || 0,
        ...(t.deleted ? { deleted: true } : {}),
      })),
    })),
    settings: {
      reminderTimes: d.settings?.reminderTimes || ['09:00', '13:00', '18:00'],
      skin: d.settings?.skin || 'classic',
      updatedAt: d.settings?.updatedAt || 0,
    },
  };
}

function mergeItems(xs, ys, withTasks) {
  const map = new Map();
  const order = [];
  for (const x of xs) { map.set(x.id, x); order.push(x.id); }
  for (const y of ys) {
    const x = map.get(y.id);
    if (!x) { map.set(y.id, y); order.push(y.id); continue; }
    const winner = (y.updatedAt || 0) > (x.updatedAt || 0) ? y : x;
    const merged = { ...winner };
    if (withTasks) merged.tasks = mergeItems(x.tasks || [], y.tasks || [], false);
    map.set(y.id, merged);
  }
  return order.map((id) => map.get(id));
}

function merge(a, b) {
  return {
    version: 2,
    lists: mergeItems(a.lists, b.lists, true),
    settings: (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings,
  };
}

function prune(d) {
  const cutoff = Date.now() - TOMBSTONE_TTL;
  d.lists = d.lists.filter((l) => !(l.deleted && l.updatedAt < cutoff));
  for (const l of d.lists) l.tasks = l.tasks.filter((t) => !(t.deleted && t.updatedAt < cutoff));
  return d;
}

// Key-order-independent JSON, for "did anything actually change?" checks.
const canon = (v) => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
    : x);

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

class Store {
  constructor({ localDir, onChange }) {
    this.localDir = localDir;
    this.onChange = onChange || (() => {});
    this.localFile = path.join(localDir, 'local.json');
    this.local = { syncDir: null, figurePos: null, lastReminders: {}, ghostHidden: false, ...(readJSON(this.localFile) || {}) };
    this.shared = null;
    this.saveTimer = null;
    this.watching = null;
    this.pollTimer = null;
  }

  get dir() { return this.local.syncDir || this.localDir; }
  get file() { return path.join(this.dir, 'tasks.json'); }

  // ---------- disk ----------
  readDisk() {
    let dir;
    try { dir = fs.readdirSync(this.dir); } catch { return { data: null, files: [] }; }
    const files = dir.filter((f) => FILE_RE.test(f)).map((f) => path.join(this.dir, f));
    let data = null;
    for (const f of files) {
      const raw = readJSON(f);
      if (!raw) continue;
      data = data ? merge(data, normalize(raw)) : normalize(raw);
    }
    return { data, files };
  }

  writeDisk() {
    const { data: disk, files } = this.readDisk();
    if (disk) this.shared = merge(disk, this.shared);
    prune(this.shared);
    const json = JSON.stringify(this.shared, null, 2);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = path.join(this.dir, `.tasks.json.${process.pid}.tmp`);
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, this.file);
    // Fold conflict copies back in, then remove them.
    for (const f of files) if (f !== this.file) { try { fs.unlinkSync(f); } catch {} }
    return disk;
  }

  saveLocal() {
    try {
      fs.mkdirSync(this.localDir, { recursive: true });
      fs.writeFileSync(this.localFile, JSON.stringify(this.local, null, 2));
    } catch (e) { console.error('local save failed', e); }
  }

  load() {
    // Migrate v1: old tasks.json held figurePos/lastReminders too.
    if (!this.local.syncDir) {
      const old = readJSON(path.join(this.localDir, 'tasks.json'));
      if (old && (old.figurePos || old.lastReminders) && !readJSON(this.localFile)) {
        this.local.figurePos = old.figurePos || null;
        this.local.lastReminders = old.lastReminders || {};
        this.saveLocal();
      }
    }
    const { data } = this.readDisk();
    this.shared = data || defaultShared();
    this.flush();
    this.watch();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.saveTimer);
    try { this.writeDisk(); } catch (e) { console.error('save failed', e); }
  }

  // Pick up edits from the other Mac. Disk order wins so two Macs never
  // ping-pong over ordering; we only write back if disk is missing something.
  reloadFromDisk() {
    const { data, files } = this.readDisk();
    if (!data) return;
    const before = canon(this.shared);
    this.shared = merge(data, this.shared);
    if (files.length > 1 || canon(this.shared) !== canon(data)) this.save();
    if (canon(this.shared) !== before) this.onChange();
  }

  watch() {
    this.unwatch();
    const file = this.file;
    fs.watchFile(file, { interval: 1500 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs) this.reloadFromDisk();
    });
    this.watching = file;
    this.pollTimer = setInterval(() => this.reloadFromDisk(), 20000); // catches conflict copies
  }

  unwatch() {
    if (this.watching) fs.unwatchFile(this.watching);
    clearInterval(this.pollTimer);
    this.watching = null;
  }

  // ---------- sync settings ----------
  syncStatus() {
    const dir = this.local.syncDir;
    const drives = findGoogleDrives();
    const account = isGoogleDrivePath(dir) ? (dir.match(/GoogleDrive-([^/]+)/) || [])[1] || 'Google Drive' : null;
    return {
      mode: !dir ? 'off' : account ? 'gdrive' : 'folder',
      dir,
      account,
      driveAvailable: drives.length > 0,
      syncAccount: SYNC_ACCOUNT || (drives[0] ? drives[0].account : ''),
      accountFound: !!pickDrive(drives),
      driveAccounts: drives.map((d) => d.account),
    };
  }

  setSyncDir(dir) {
    this.flush();
    this.unwatch();
    this.local.syncDir = dir || null;
    this.saveLocal();
    // Joining a folder that already has lists (e.g. the 2nd Mac): fold our
    // same-named lists into theirs so "Today" doesn't appear twice.
    const { data: there } = this.readDisk();
    if (there) {
      const byName = new Map(there.lists.filter((l) => !l.deleted).map((l) => [l.name.trim().toLowerCase(), l]));
      const kept = new Map();
      const add = (l) => {
        const have = kept.get(l.id);
        if (have) have.tasks = mergeItems(have.tasks, l.tasks, false);
        else kept.set(l.id, { ...l, tasks: [...l.tasks] });
      };
      const now = Date.now();
      for (const l of this.shared.lists) {
        const twin = byName.get(l.name.trim().toLowerCase());
        if (!l.deleted && twin && twin.id !== l.id) {
          add({ ...twin, tasks: l.tasks.filter((t) => !t.deleted).map((t) => ({ ...t, updatedAt: now })) });
        } else {
          add(l);
        }
      }
      this.shared.lists = [...kept.values()];
    }
    // Merge what we have into whatever is already at the destination.
    this.flush();
    this.watch();
    this.onChange();
  }

  // ---------- view + mutations ----------
  view() {
    const lists = this.shared.lists.filter((l) => !l.deleted).map((l) => ({
      id: l.id, name: l.name, tasks: l.tasks.filter((t) => !t.deleted),
    }));
    return { lists, settings: this.shared.settings };
  }

  pendingCount() {
    return this.view().lists.reduce((n, l) => n + l.tasks.filter((t) => !t.done).length, 0);
  }

  mutate(a) {
    const now = Date.now();
    const list = (id) => this.shared.lists.find((l) => l.id === id && !l.deleted);
    const task = (lid, tid) => list(lid)?.tasks.find((t) => t.id === tid && !t.deleted);
    switch (a.type) {
      case 'add-list':
        this.shared.lists.push({ id: uid(), name: (a.name || '').trim() || 'Untitled', updatedAt: now, tasks: [] });
        break;
      case 'rename-list': {
        const l = list(a.listId);
        if (l && a.name.trim()) { l.name = a.name.trim(); l.updatedAt = now; }
        break;
      }
      case 'delete-list': {
        const l = list(a.listId);
        if (l) { l.deleted = true; l.updatedAt = now; for (const t of l.tasks) { t.deleted = true; t.updatedAt = now; } }
        break;
      }
      case 'add-task': {
        const l = list(a.listId);
        if (l && a.text.trim()) l.tasks.push({ id: uid(), text: a.text.trim(), done: false, createdAt: now, doneAt: null, updatedAt: now });
        break;
      }
      case 'toggle-task': {
        const t = task(a.listId, a.taskId);
        if (t) { t.done = !t.done; t.doneAt = t.done ? now : null; t.updatedAt = now; }
        break;
      }
      case 'edit-task': {
        const t = task(a.listId, a.taskId);
        if (t && a.text.trim() && t.text !== a.text.trim()) { t.text = a.text.trim(); t.updatedAt = now; }
        break;
      }
      case 'delete-task': {
        const t = task(a.listId, a.taskId);
        if (t) { t.deleted = true; t.updatedAt = now; }
        break;
      }
      case 'clear-done': {
        const l = list(a.listId);
        if (l) for (const t of l.tasks) if (t.done && !t.deleted) { t.deleted = true; t.updatedAt = now; }
        break;
      }
      case 'set-reminders': {
        const valid = (a.times || []).filter((t) => /^\d{2}:\d{2}$/.test(t));
        if (valid.length) { this.shared.settings = { ...this.shared.settings, reminderTimes: [...new Set(valid)].sort(), updatedAt: now }; }
        break;
      }
      case 'set-skin':
        this.shared.settings = { ...this.shared.settings, skin: a.skin, updatedAt: now };
        break;
    }
    this.save();
  }
}

module.exports = { Store, merge, normalize, findGoogleDrives, pickDrive, SYNC_FOLDER_NAME, SYNC_ACCOUNT };
