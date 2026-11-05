const test = require('node:test');
const assert = require('node:assert');
const { isNewer, pickAsset, trustedUrl, bundlePath } = require('../updater');

test('isNewer compares numerically', () => {
  assert.ok(isNewer('v1.10.0', '1.9.0'));
  assert.ok(!isNewer('v1.3.0', '1.3.0'));
  assert.ok(!isNewer('1.2.9', '1.3.0'));
});

test('pickAsset matches this architecture', () => {
  const r = { assets: [{ name: 'g-1-x64.zip' }, { name: 'g-1-arm64.zip' }, { name: 'notes-arm64.txt' }] };
  assert.equal(pickAsset(r, 'arm64').name, 'g-1-arm64.zip');
  assert.equal(pickAsset({ assets: [] }, 'arm64'), null);
});

test('only this repo’s release downloads are trusted', () => {
  assert.ok(trustedUrl('https://github.com/tarvinarora/ghostyy.ai/releases/download/v1/a.zip'));
  assert.ok(!trustedUrl('https://github.com/someone/else/releases/download/v1/a.zip'));
  assert.ok(!trustedUrl('https://github.com.evil.io/tarvinarora/ghostyy.ai/releases/download/v1/a.zip'));
  assert.ok(!trustedUrl('http://github.com/tarvinarora/ghostyy.ai/releases/download/v1/a.zip'));
});

test('bundlePath finds the .app from the executable', () => {
  assert.equal(bundlePath('/Applications/G.app/Contents/MacOS/G'), '/Applications/G.app');
  assert.equal(bundlePath('/usr/local/bin/electron'), null);
});
