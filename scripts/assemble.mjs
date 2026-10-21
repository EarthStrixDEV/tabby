import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'php');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'public'), { recursive: true });

const copyDir = (from, to) => {
  const src = join(root, from);
  if (existsSync(src)) cpSync(src, join(out, to), { recursive: true });
};
copyDir('shared/public', 'public');
copyDir('apache/public', 'public');
copyDir('apache/src', 'src');

const config = join(root, 'apache', 'config.php');
if (existsSync(config)) cpSync(config, join(out, 'config.php'));
