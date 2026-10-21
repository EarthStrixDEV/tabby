import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mysql = process.env.MYSQL_BIN || 'mysql';
const DB = 'tb_local';
const TRUNCATABLE = ['debts', 'rate_limits'];

const run = (args, input) => {
  const r = spawnSync(mysql, ['-uroot', ...args], { input, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(r.error?.message ?? r.stderr);
    process.exit(r.status || 1);
  }
};

const argv = process.argv.slice(2);
const flag = argv.indexOf('--truncate');
if (flag !== -1) {
  // Empties one table and keeps the database; the name is allow-listed because it is interpolated into SQL.
  const table = argv[flag + 1];
  if (!TRUNCATABLE.includes(table)) {
    console.error(`--truncate needs one of: ${TRUNCATABLE.join(', ')}`);
    process.exit(2);
  }
  run([DB, '-e', `TRUNCATE TABLE ${table}`]);
  console.log(`${DB}.${table} truncated`);
} else {
  run(['-e', `DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`]);
  run([DB], readFileSync(join(root, 'shared', 'schema.sql'), 'utf8'));
  console.log(`${DB} reset`);
}
