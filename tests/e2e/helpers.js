import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const TOKEN = process.env.TEST_TOKEN || 'local-test-token-0123456789abcdef';

export const MOBILE = { width: 390, height: 844 };
export const NARROW = { width: 360, height: 740 };
export const DESKTOP = { width: 1280, height: 800 };

/** Empties the debts table and the app cache so /api/summary cannot serve stale totals. */
export async function resetDb() {
  execFileSync(process.execPath, [join(root, 'scripts', 'db-reset.mjs'), '--truncate', 'debts'], { stdio: 'pipe' });
  const res = await fetch(`${BASE_URL}/api/cache`, { method: 'DELETE', headers: { 'X-Test-Token': TOKEN } });
  if (!res.ok) throw new Error(`DELETE /api/cache -> ${res.status}`);
}

/** Creates one debt through the API and returns the created row. */
export async function createDebt(request, body) {
  const res = await request.post('/api/debts', { data: body });
  if (res.status() !== 201) throw new Error(`POST /api/debts -> ${res.status()} ${await res.text()}`);
  return res.json();
}
