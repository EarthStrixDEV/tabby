import { test, expect } from '@playwright/test';
import { MOBILE, DESKTOP, resetDb, createDebt } from './helpers.js';
import { TOKEN } from '../helpers/http.js';

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.setViewportSize(MOBILE);
});

async function seedThree(request) {
  // Created oldest first; the list is ordered by id descending.
  await createDebt(request, { friend_name: 'ต้น', amount: '180', note: 'ค่าข้าวเที่ยง' });
  await createDebt(request, { friend_name: 'มีน', amount: '95', note: 'ค่ากาแฟ', is_paid: 1 });
  await createDebt(request, { friend_name: 'แพรว', amount: '280.50', note: 'ค่าแท็กซี่กลับบ้าน' });
}

test('empty DB shows the empty state without filter or FAB', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('สมุดยังว่างอยู่')).toBeVisible();
  await expect(page.getByTestId('summary-total')).toHaveText('฿0');
  await expect(page.getByTestId('summary-sub')).toHaveText('ยังไม่มีใครติดเงิน');
  await expect(page.locator('.seg')).toHaveCount(0);
  await expect(page.getByTestId('fab-add')).toHaveCount(0);
  await expect(page.locator('#view-list a.btn[href="#/new"]:visible')).toHaveText('เพิ่มรายการ');
  await expect(page.locator('#view-list')).not.toContainText('null');
});

test('summary and filter counts come from /api/summary', async ({ page, request }) => {
  await seedThree(request);
  await page.goto('/');
  await expect(page.getByTestId('summary-total')).toHaveText('฿460.50');
  await expect(page.getByTestId('summary-sub')).toHaveText('เพื่อน 2 คน ยังไม่จ่าย 2 รายการ');
  await expect(page.getByTestId('filter-all')).toHaveText('ทั้งหมด 3');
  await expect(page.getByTestId('filter-unpaid')).toHaveText('ยังไม่จ่าย 2');
  await expect(page.getByTestId('filter-paid')).toHaveText('จ่ายแล้ว 1');
  await expect(page.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('filter-paid')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await expect(page.getByTestId('fab-add')).toBeVisible();
  await expect(page.getByTestId('fab-add')).toHaveAttribute('href', '#/new');
});

test('paid filter shows only paid rows, styled as paid', async ({ page, request }) => {
  await seedThree(request);
  await page.goto('/');
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await page.getByTestId('filter-paid').click();
  await expect(page.getByTestId('filter-paid')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await expect(page.getByTestId('debt-name')).toHaveText('มีน');
  await expect(page.getByTestId('debt-row')).toHaveClass(/\bis-paid\b/);
  await expect(page.getByTestId('check-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('check-btn')).toHaveAttribute('aria-label', 'ยกเลิกการจ่ายของ มีน');
});

test('a filter with no rows offers to show everything', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.getByTestId('filter-paid').click();
  await expect(page.getByText('ไม่มีรายการจ่ายแล้ว')).toBeVisible();
  await page.getByRole('button', { name: 'ดูทั้งหมด' }).click();
  await expect(page.getByTestId('filter-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
});

test('friend names render as text, never as HTML', async ({ page, request }) => {
  const name = '<img src=x onerror="window.__x=1">';
  await createDebt(request, { friend_name: name, amount: '10' });
  await page.goto('/');
  await expect(page.getByTestId('debt-name')).toHaveText(name);
  await expect(page.locator('#view-list img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
});

test('rows created now are grouped under วันนี้', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  const group = page.locator('.debt-group', { has: page.getByTestId('debt-row') });
  await expect(group.locator('h2')).toHaveText('วันนี้');
});

test('avatar shows the first consonant, skipping a leading vowel', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  await page.goto('/');
  const item = page.locator(`[data-testid=debt-row][data-id="${row.id}"]`);
  await expect(item.locator('.avatar')).toHaveText('พ');
  await expect(item.locator('.avatar')).toHaveClass(/\bavatar--[abcd]\b/);
  await expect(item.locator('a.debt__main')).toHaveAttribute('href', `#/edit/${row.id}`);
  await expect(item.getByTestId('check-btn')).toHaveAttribute('aria-label', 'ทำเครื่องหมายว่า แพรว จ่ายแล้ว');
  await expect(item.getByTestId('debt-amount')).toHaveText('฿280');
});

test('pagination on mobile and desktop', async ({ page, request }) => {
  const seed = await request.post('/api/seed?n=25&reset=1', { headers: { 'X-Test-Token': TOKEN } });
  expect(seed.status()).toBe(200);

  await page.goto('/');
  await expect(page.getByTestId('debt-row')).toHaveCount(20);
  await expect(page.locator('.pager')).toContainText('หน้า 1 จาก 2');
  await page.getByTestId('pager-next').click();
  await expect(page.locator('.pager')).toContainText('หน้า 2 จาก 2');
  await expect(page.getByTestId('debt-row')).toHaveCount(5);

  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await expect(page.getByText('แสดง 1–20 จาก 25 รายการ (หน้าละ 20)')).toBeVisible();
  await expect(page.locator('.pager [aria-current="page"]')).toHaveText('1');
  const prev = page.getByTestId('pager-prev');
  await expect(prev).toHaveAttribute('aria-disabled', 'true');
  expect(await prev.evaluate((el) => el.tagName)).toBe('SPAN');
  expect(await prev.evaluate((el) => el.tabIndex)).toBe(-1);

  await page.getByTestId('pager-next').click();
  await expect(page.getByText('แสดง 21–25 จาก 25 รายการ (หน้าละ 20)')).toBeVisible();
  await expect(page.locator('.pager [aria-current="page"]')).toHaveText('2');
  await expect(page).toHaveURL(/[?&]page=2\b/);
  await expect(page.getByTestId('debt-row')).toHaveCount(5);
});

test('list state is read from the query string', async ({ page, request }) => {
  await seedThree(request);
  await page.setViewportSize(DESKTOP);
  await page.goto('/?paid=1');
  await expect(page.getByTestId('filter-paid')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await page.getByTestId('filter-unpaid').click();
  await expect(page).toHaveURL(/[?&]paid=0\b/);
  await expect(page.getByTestId('debt-row')).toHaveCount(2);
});

test('desktop table shows Buddhist-era dates and no sort arrows', async ({ page, request }) => {
  await seedThree(request);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await expect(page.locator('table.debts-table tbody tr[data-testid=debt-row]')).toHaveCount(3);
  await expect(page.locator('.debt-list')).toHaveCount(0);
  const dates = await page.locator('td.debts-table__date').allTextContents();
  expect(dates).toHaveLength(3);
  for (const d of dates) expect(d).toMatch(/^\d{1,2} \S+ 25\d\d$/);
  const heads = await page.locator('table.debts-table thead th').allTextContents();
  expect(heads.map((t) => t.trim())).toEqual(['เพื่อน', 'โน้ต', 'จำนวน', 'วันที่', 'สถานะ', 'จัดการ']);
  for (const t of heads) expect(t).not.toMatch(/[▲▼↑↓⇅]/);
  await expect(page.locator('table.debts-table th[aria-sort]')).toHaveCount(0);
  await expect(page.getByTestId('summary-total')).toHaveText('฿460.50');
  await expect(page.locator('.summary-cards')).toContainText('2 คน');
  await expect(page.locator('.summary-cards')).toContainText('2 รายการ');
  await expect(page.getByTestId('fab-add')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลบรายการของแพรว' })).toBeVisible();
});

test('load error shows a retry that recovers', async ({ page, request }) => {
  await seedThree(request);
  await page.route('**/api/debts*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server_error"}' }));
  await page.goto('/');
  await expect(page.getByText('โหลดรายการไม่สำเร็จ')).toBeVisible();
  await expect(page.getByTestId('summary-total')).toHaveText('฿460.50');
  await page.unroute('**/api/debts*');
  await page.getByRole('button', { name: 'ลองใหม่' }).click();
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await expect(page.getByText('โหลดรายการไม่สำเร็จ')).toHaveCount(0);
});

test('summary error shows a dash and does not block the list', async ({ page, request }) => {
  await seedThree(request);
  await page.route('**/api/summary', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server_error"}' }));
  await page.goto('/');
  await expect(page.getByTestId('summary-total')).toHaveText('—');
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await expect(page.locator('#view-list')).not.toContainText('null');
});

test('a 429 shows the retry_after wait', async ({ page }) => {
  await page.route('**/api/debts*', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited","retry_after":12}' }));
  await page.goto('/');
  await expect(page.getByText('ส่งคำขอถี่เกินไป รอ 12 วินาที')).toBeVisible();
});

test('skeleton rows and aria-busy while loading', async ({ page, request }) => {
  await seedThree(request);
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/api/debts*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('main#main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.debt-list .skeleton--avatar')).toHaveCount(5);
  release();
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');

  await page.setViewportSize(DESKTOP);
  let release2;
  const gate2 = new Promise((r) => (release2 = r));
  await page.unroute('**/api/debts*');
  await page.route('**/api/debts*', async (route) => {
    await gate2;
    await route.continue();
  });
  await page.reload();
  await expect(page.locator('table.debts-table tbody tr')).toHaveCount(8);
  release2();
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
});

test('crossing the breakpoint swaps list and table without duplicate test hooks', async ({ page, request }) => {
  await seedThree(request);
  await page.goto('/');
  await expect(page.locator('ul.debt-list [data-testid=debt-row]')).toHaveCount(3);
  await page.setViewportSize(DESKTOP);
  await expect(page.locator('table.debts-table [data-testid=debt-row]')).toHaveCount(3);
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await expect(page.getByTestId('summary-total')).toHaveCount(1);
  await expect(page.getByTestId('fab-add')).toHaveCount(0);
  await page.setViewportSize(MOBILE);
  await expect(page.locator('ul.debt-list [data-testid=debt-row]')).toHaveCount(3);
  await expect(page.getByTestId('summary-total')).toHaveCount(1);
  await expect(page.getByTestId('fab-add')).toBeVisible();
});
