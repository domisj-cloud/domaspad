const fs = require('node:fs');
const path = require('node:path');
const { devDependencies } = require('../package.json');

if (process.versions.electron !== devDependencies.electron) {
  throw new Error(`Run this check with the pinned Electron ${devDependencies.electron} runtime.`);
}

// Electron uses Chromium's Brotli decoder, so process.versions.node/brotli
// alone cannot establish whether the CVE-2026-111497 fix was backported.
// The upstream fix adds this exact decoder error string:
// https://github.com/google/brotli/commit/0ed4268a4401abcb4472096340477cf4af7d1a2b
const decoderBinary = process.platform === 'darwin'
  ? path.join(path.dirname(process.execPath), '..', 'Frameworks',
    'Electron Framework.framework', 'Versions', 'A', 'Electron Framework')
  : process.execPath;
const patchMarker = Buffer.from('\0_ERROR_FORMAT_BLOCK_SWITCH\0');

if (!fs.readFileSync(decoderBinary).includes(patchMarker)) {
  throw new Error('Cannot verify the Brotli CVE-2026-111497 fix in this Electron build.');
}

console.log(`Electron ${process.versions.electron}; Node.js ${process.versions.node}; ` +
  `Chromium ${process.versions.chrome}; Brotli fix marker verified.`);
