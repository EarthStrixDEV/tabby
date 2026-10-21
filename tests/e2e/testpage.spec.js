import { test, expect } from '@playwright/test';
import { MOBILE, NARROW, DESKTOP, resetDb } from './helpers.js';
import { TOKEN } from '../helpers/http.js';

// php -S is single-threaded: bandwidth rounds and the load test queue behind each other.
test.setTimeout(90_000);

test.beforeEach(async () => {
  await resetDb();
});

test('download without a token asks for the token', async ({ page }) => {
  await page.goto('/test');
  await page.getByTestId('bw-start-dl').click();
  await expect(page.locator('#bw-error')).toHaveText('ใส่รหัสทดสอบก่อน');
  await expect(page.getByTestId('bw-speed')).toHaveText('—');
});

test('1 MB download runs 3 rounds and shows the median Mbps', async ({ page }) => {
  await page.goto('/test');
  await page.getByTestId('token-input').fill(TOKEN);
  await page.getByTestId('bw-size').selectOption('1');
  await page.getByTestId('bw-start-dl').click();
  await expect(page.getByTestId('bw-speed')).toHaveText(/^\d+(\.\d)?$/, { timeout: 60_000 });
  await expect(page.getByTestId('bw-progress')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByTestId('bw-start-dl')).toBeEnabled();
  await expect(page.locator('#bw-ttfb')).toHaveText(/^\d+ ms$/);
  await expect(page.locator('#bw-total')).toHaveText(/^\d+ ms$/);
  await expect(page.locator('#bw-error')).toBeHidden();
});

test('caching checks fill all 8 rows and announce a summary', async ({ page }) => {
  await page.goto('/test');
  await page.getByTestId('token-input').fill(TOKEN);
  await page.getByTestId('cache-run').click();
  const summary = page.locator('#cache-summary');
  await expect(summary).toHaveText(/^ผ่าน \d+ จาก 8 ข้อ$/, { timeout: 30_000 });
  await expect(summary).toHaveAttribute('aria-live', 'polite');
  const rows = page.locator('[data-testid^="cache-row-"]');
  await expect(rows).toHaveCount(8);
  for (const row of await rows.all()) {
    await expect(row.locator('.badge')).toHaveText(/^(ผ่าน|ไม่ผ่าน|บันทึก)$/);
  }
  await expect(page.getByTestId('cache-row-server-cache').locator('.badge')).toHaveText('บันทึก');
  await expect(page.getByTestId('cache-row-etag').locator('a[href="/cache/static"]')).toHaveAttribute('target', '_blank');
  // The app-cache check deletes its temporary row again.
  const list = await page.request.get('/api/debts');
  expect((await list.json()).total).toBe(0);
});

test('load test on /api/ping reports 20 successes and a histogram (8 bars mobile, 10 desktop)', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/test');
  await expect(page.getByTestId('api-reqs')).toHaveValue('100');
  await expect(page.getByTestId('api-conc')).toHaveValue('10');
  await page.getByTestId('api-endpoint').selectOption('/api/ping');
  await page.getByTestId('api-reqs').fill('20');
  await page.getByTestId('api-conc').fill('5');
  await page.getByTestId('api-run').click();
  await expect(page.getByTestId('api-stat-ok')).toHaveText('20', { timeout: 60_000 });
  await expect(page.getByTestId('api-stat-err')).toHaveText('0.0%');
  await expect(page.getByTestId('api-stat-avg')).toHaveText(/^\d+ ms$/);
  await expect(page.getByTestId('api-run')).toHaveText('เริ่มทดสอบ');
  const hist = page.getByTestId('api-histogram');
  await expect(hist).toHaveAttribute('role', 'img');
  await expect(hist).toHaveAttribute('aria-label', /^กราฟแท่งการกระจายเวลาตอบสนอง ส่วนใหญ่อยู่ที่/);
  await expect(hist.locator('.histogram__bar')).toHaveCount(8);
  await page.setViewportSize(DESKTOP);
  await expect(hist.locator('.histogram__bar')).toHaveCount(10);
  await expect(hist.locator('.histogram__bar--slow')).toHaveCount(2);
});

test('over-cap load inputs are clamped with inline errors', async ({ page }) => {
  await page.goto('/test');
  await page.getByTestId('api-reqs').fill('5000');
  await page.getByTestId('api-conc').fill('80');
  await page.getByTestId('api-endpoint').selectOption('/api/slow?ms=200');
  await page.getByTestId('api-run').click();
  await expect(page.getByTestId('api-reqs')).toHaveValue('1000');
  await expect(page.getByTestId('api-conc')).toHaveValue('50');
  await expect(page.locator('#api-reqs-error')).toHaveText('สูงสุด 1,000');
  await expect(page.locator('#api-conc-error')).toHaveText('สูงสุด 50');
  // /api/slow needs the token: nothing runs without it.
  await expect(page.locator('#api-error')).toHaveText('ใส่รหัสทดสอบก่อน');
  await expect(page.getByTestId('api-stat-ok')).toHaveText('—');
});

test('the token never reaches storage or cookies', async ({ page }) => {
  await page.goto('/test');
  await page.getByTestId('token-input').fill(TOKEN);
  await expect(page.getByTestId('token-input')).toHaveAttribute('type', 'password');
  await page.getByTestId('cache-run').click();
  await expect(page.locator('#cache-summary')).toHaveText(/^ผ่าน \d+ จาก 8 ข้อ$/, { timeout: 30_000 });
  const stored = await page.evaluate(() => {
    const dump = (s) => Array.from({ length: s.length }, (_, i) => s.key(i) + '=' + s.getItem(s.key(i))).join('\n');
    return dump(localStorage) + dump(sessionStorage) + document.cookie;
  });
  expect(stored).not.toContain(TOKEN);
});

test('no horizontal scroll at 360px on /test', async ({ page }) => {
  await page.setViewportSize(NARROW);
  const res = await page.goto('/test');
  expect(res.status()).toBe(200);
  await expect(page.getByTestId('api-run')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
