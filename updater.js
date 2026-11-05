// Ghost Assistant — updates from GitHub releases.
// Electron's built-in updater needs a paid Apple signature, and this app isn't
// signed, so it does the job itself: find a newer release, download the zip,
// check it, then swap the app in when you choose to restart.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);
const REPO = 'tarvinarora/ghostyy.ai';
const FEED = `https://api.github.com/repos/${REPO}/releases/latest`;
const APP_NAME = 'Ghost Assistant.app';
const CHECK_EVERY = 6 * 3600 * 1000;
const FIRST_CHECK_AFTER = 30 * 1000;

function isNewer(tag, current) {
  const parts = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const a = parts(tag), b = parts(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

function pickAsset(release, arch) {
  return (release.assets || []).find((a) => a.name.endsWith('.zip') && a.name.includes(arch)) || null;
}

function trustedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${REPO}/releases/download/`);
  } catch { return false; }
}

// /Applications/Ghost Assistant.app/Contents/MacOS/Electron → the .app itself.
function bundlePath(exePath) {
  const p = path.resolve(exePath, '..', '..', '..');
  return p.endsWith('.app') ? p : null;
}

class Updater {
  constructor({ app, bundleId, onChange, feed }) {
    this.app = app;
    this.bundleId = bundleId;
    this.onChange = onChange || (() => {});
    this.feed = feed || FEED;
    this.local = !!feed; // test feed on this Mac: skip the github.com check
    this.state = { status: 'idle', version: null, message: '' };
    this.ready = null;
    this.busy = false;
  }

  set(status, extra = {}) {
    this.state = { status, version: null, message: '', ...extra };
    this.onChange(this.state);
  }

  start() {
    if (!this.app.isPackaged) return;
    setTimeout(() => this.check(), FIRST_CHECK_AFTER);
    setInterval(() => this.check(), CHECK_EVERY);
  }

  async check({ manual = false } = {}) {
    if (this.busy || this.ready) return this.state;
    if (!this.app.isPackaged) {
      if (manual) this.set('error', { message: 'Updates only work in the installed app.' });
      return this.state;
    }
    this.busy = true;
    try {
      this.set('checking');
      const res = await fetch(this.feed, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ghost-assistant-updater' },
      });
      if (res.status === 404) return this.set('current'), this.state; // no releases yet
      if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
      const release = await res.json();
      if (!isNewer(release.tag_name, this.app.getVersion())) return this.set('current'), this.state;
      const asset = pickAsset(release, process.arch);
      if (!asset) throw new Error(`Release ${release.tag_name} has no ${process.arch} download.`);
      if (!this.local && !trustedUrl(asset.browser_download_url)) throw new Error('The download link isn’t from this project’s releases.');
      const version = String(release.tag_name).replace(/^v/, '');
      this.set('downloading', { version });
      await this.fetchAndPrepare(asset, version);
      this.set('ready', { version });
    } catch (e) {
      console.warn('update failed:', e.message);
      this.set('error', { message: manual ? e.message : '' });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  async fetchAndPrepare(asset, version) {
    const root = path.join(this.app.getPath('userData'), 'updates');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    const zip = path.join(root, 'update.zip');

    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'ghost-assistant-updater' } });
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (asset.size && bytes.length !== asset.size) throw new Error('The download is incomplete.');
    if (asset.digest) {
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');
      if (asset.digest !== `sha256:${sha}`) throw new Error('The download failed its checksum.');
    }
    fs.writeFileSync(zip, bytes);

    const out = path.join(root, 'new');
    await run('/usr/bin/ditto', ['-x', '-k', zip, out]);
    const appPath = path.join(out, APP_NAME);
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
    const plist = (key) => run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')]);
    const { stdout: id } = await plist('CFBundleIdentifier');
    const { stdout: ver } = await plist('CFBundleShortVersionString');
    if (id.trim() !== this.bundleId) throw new Error('The download is a different app.');
    if (ver.trim() !== version) throw new Error('The download’s version doesn’t match its release.');
    fs.unlinkSync(zip);
    this.ready = { appPath, version };
  }

  // Waits for this app to quit, swaps the bundle (restoring the old one if the
  // move fails), then reopens. Paths go in as arguments, never into the script.
  installAndRestart() {
    if (!this.ready) return;
    const target = bundlePath(this.app.getPath('exe'));
    let writable = !!target && !target.includes('/AppTranslocation/');
    if (writable) { try { fs.accessSync(path.dirname(target), fs.constants.W_OK); } catch { writable = false; } }
    if (!writable) {
      this.ready = null;
      this.set('error', { message: 'Move Ghost Assistant into Applications, then update again.' });
      return;
    }
    const script = `
      while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
      rm -rf "$3.old"
      mv "$3" "$3.old" || exit 1
      if mv "$2" "$3"; then rm -rf "$3.old"; else mv "$3.old" "$3"; fi
      open "$3"
    `;
    spawn('/bin/sh', ['-c', script, 'ghost-update', String(process.pid), this.ready.appPath, target], {
      detached: true, stdio: 'ignore',
    }).unref();
    this.app.quit();
  }
}

module.exports = { Updater, isNewer, pickAsset, trustedUrl, bundlePath, REPO };
