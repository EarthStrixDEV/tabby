// Copies the self-hosted woff2 subsets from @fontsource into shared/public/static/fonts.
// Run after `npm i` when the font set changes; the output is committed so deploys need no npm.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'shared', 'public', 'static', 'fonts');
const FAMILIES = { 'noto-sans-thai': [400, 500, 600], prompt: [500, 600] };
const SUBSETS = ['thai', 'latin'];

mkdirSync(out, { recursive: true });

const licenses = [];
for (const [pkg, weights] of Object.entries(FAMILIES)) {
  const dir = join(root, 'node_modules', '@fontsource', pkg);
  for (const subset of SUBSETS) {
    for (const weight of weights) {
      const file = `${pkg}-${subset}-${weight}-normal.woff2`;
      copyFileSync(join(dir, 'files', file), join(out, file));
      console.log(file);
    }
  }
  licenses.push(`=== ${pkg} ===\n\n${readFileSync(join(dir, 'LICENSE'), 'utf8').trim()}\n`);
}

// Both families ship under SIL OFL 1.1; each keeps its own copyright line.
writeFileSync(join(out, 'OFL.txt'), licenses.join('\n'));
console.log('OFL.txt');
