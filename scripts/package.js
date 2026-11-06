#!/usr/bin/env node
// npm run package            build, install into Applications, relaunch
// npm run package -- --no-install    build only
// npm run release            build, zip and publish a GitHub release
//
// The build never contains .env or config.local.json. A local install copies
// them into the app's data folder instead, and a build that contains either
// one, or their values, is refused. This repo's releases are public.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { parseKey } = require('../ai');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'Ghost Assistant';
const BUNDLE_ID = 'com.tarvinarora.ghostassistant';
const ARCH = process.arch;
const OUT = path.join(ROOT, 'dist');
const BUILT = path.join(OUT, `${NAME}-darwin-${ARCH}`, `${NAME}.app`);
const INSTALL_DIR = process.env.GHOST_INSTALL_DIR || '/Applications';
const DATA_DIR = process.env.GHOST_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', NAME);

const args = new Set(process.argv.slice(2));
const { version } = require('../package.json');
const sh = (cmd, ...rest) => execFileSync(cmd, rest, { stdio: 'inherit', cwd: ROOT });
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };

function build() {
  console.log(`Building ${NAME} ${version}…`);
  fs.rmSync(path.dirname(BUILT), { recursive: true, force: true });
  const ignore = ['^/\\.env', '^/config\\.local\\.json$', '^/dist($|/)', '^/brag-output', '^/scripts($|/)', '^/test($|/)',
    '^/README\\.md$', '^/\\.gitignore$', '^/\\.claude($|/)', '\\.DS_Store$'];
  sh(path.join(ROOT, 'node_modules', '.bin', 'electron-packager'), '.', NAME,
    '--platform=darwin', `--arch=${ARCH}`, `--out=${OUT}`, '--overwrite',
    `--app-bundle-id=${BUNDLE_ID}`, `--app-version=${version}`, '--no-asar',
    ...ignore.map((re) => `--ignore=${re}`));
  // The packager exits 0 even when it silently stops early, so check the result.
  if (!fs.existsSync(path.join(BUILT, 'Contents', 'Info.plist'))) throw new Error('The build produced no app.');
  // Apple Silicon refuses to run unsigned code. An ad-hoc signature is enough on this Mac.
  sh('/usr/bin/codesign', '--force', '--deep', '--sign', '-', BUILT);
  sh('/usr/bin/codesign', '--verify', '--deep', '--strict', BUILT);
}

function assertNoSecrets() {
  const key = parseKey(read('.env'));
  let account = '';
  try { account = String(JSON.parse(read('config.local.json')).syncAccount || '').trim(); } catch {}
  const values = [key, account].filter(Boolean);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/^\.env/.test(e.name) || e.name === 'config.local.json') throw new Error(`Refusing to ship ${p}`);
      if (!values.length || !e.isFile() || fs.statSync(p).size > 5e6) continue;
      const text = fs.readFileSync(p, 'latin1');
      if (values.some((v) => text.includes(v))) throw new Error(`A private value ended up in ${p}`);
    }
  };
  const app = path.join(BUILT, 'Contents', 'Resources', 'app');
  if (!fs.existsSync(app)) throw new Error('No app folder to check in the build.');
  walk(app);
}

function stopRunning(target) {
  const pattern = `${target}/Contents/MacOS/`;
  spawnSync('/usr/bin/pkill', ['-f', pattern]);
  for (let i = 0; i < 50; i++) {
    if (spawnSync('/usr/bin/pgrep', ['-f', pattern]).status !== 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  spawnSync('/usr/bin/pkill', ['-9', '-f', pattern]);
}

function copyPrivateFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const env = read('.env');
  if (parseKey(env)) {
    fs.writeFileSync(path.join(DATA_DIR, '.env'), env, { mode: 0o600 });
    fs.chmodSync(path.join(DATA_DIR, '.env'), 0o600);
    console.log('Copied your API key to the app’s data folder.');
  } else if (!fs.existsSync(path.join(DATA_DIR, '.env'))) {
    console.log('No API key in .env yet: morning plans use a simple ranking and Break it down stays off.');
  }
  const config = read('config.local.json');
  if (config) fs.writeFileSync(path.join(DATA_DIR, 'config.local.json'), config, { mode: 0o600 });
}

function install() {
  const target = path.join(INSTALL_DIR, `${NAME}.app`);
  const incoming = `${target}.new`;
  const old = `${target}.old`;
  stopRunning(target);
  fs.rmSync(incoming, { recursive: true, force: true });
  sh('/usr/bin/ditto', BUILT, incoming);
  fs.rmSync(old, { recursive: true, force: true });
  if (fs.existsSync(target)) fs.renameSync(target, old);
  fs.renameSync(incoming, target);
  fs.rmSync(old, { recursive: true, force: true });
  copyPrivateFiles();
  if (!args.has('--no-open')) sh('/usr/bin/open', target);
  console.log(`Installed ${NAME} ${version} to ${target}`);
}

function release() {
  const zip = path.join(OUT, `Ghost-Assistant-${version}-${ARCH}.zip`);
  fs.rmSync(zip, { force: true });
  sh('/usr/bin/ditto', '-c', '-k', '--keepParent', BUILT, zip);
  sh('gh', 'release', 'create', `v${version}`, zip, '--title', `Ghost Assistant ${version}`, '--generate-notes');
}

try {
  build();
  assertNoSecrets();
  if (args.has('--release')) release();
  else if (!args.has('--no-install')) install();
  else console.log(`Built ${BUILT}`);
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}
