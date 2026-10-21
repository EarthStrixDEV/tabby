import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mysql = process.env.MYSQL_BIN || 'mysql';
const DB = 'tb_local';

const run = (args, input) => {
  const r = spawnSync(mysql, ['-uroot', ...args], { input, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(r.error?.message ?? r.stderr);
    process.exit(r.status || 1);
  }
};

run(['-e', `DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`]);
run([DB], readFileSync(join(root, 'shared', 'schema.sql'), 'utf8'));
console.log(`${DB} reset`);
