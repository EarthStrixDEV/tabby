import { test, expect } from '@playwright/test';
import { TOKEN } from '../helpers/http.js';
import { MOBILE, DESKTOP, resetDb, createDebt } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.setViewportSize(MOBILE);
});

const rowOf = (page, id) => page.locator(`[data-testid="debt-row"][data-id="${id}"]`);
const toastText = (page) => page.getByTestId('toast').locator('span');
const unpaidCount = (page) => page.locator('[data-count="unpaid"]');

async function isPaidOnServer(request, id) {
  const res = await request.get(`/api/debts/${id}`);
  return (await res.json()).is_paid;
}

/** Holds matching requests until release() is called. */
async function gate(page, pattern, method) {
  let release;
  const opened = new Promise((resolve) => { release = resolve; });
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    await opened;
    return route.fallback();
  });
  return () => release();
}

// ---------- F2: mark paid + undo ----------

test('mobile F2: tapping marks paid at once, toasts with the row amount, undo reverts', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  const ton = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await expect(unpaidCount(page)).toHaveText('2');

  const release = await gate(page, '**/api/debts/*', 'PUT');
  const btn = rowOf(page, ton.id).getByTestId('check-btn');
  await btn.click();
  // Optimistic: pressed before the PUT has answered, and busy meanwhile.
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  await expect(btn).toBeDisabled();
  release();

  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  await expect(page.getByTestId('toast-undo')).toHaveText('เลิกทำ');
  await expect(btn).not.toHaveAttribute('aria-busy', 'true');
  await expect(btn).toBeEnabled();
  await expect(btn).toHaveAttribute('aria-label', 'ยกเลิกการจ่ายของ ต้น');
  await expect(btn).toBeFocused(); // focus comes back once the button is enabled again
  await expect(unpaidCount(page)).toHaveText('1');
  expect(await isPaidOnServer(request, ton.id)).toBe(1);

  await page.getByTestId('toast-undo').focus(); // keyboard path (F2 must be keyboard-complete)
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toHaveText('');
  await expect.poll(() => isPaidOnServer(request, ton.id)).toBe(0);
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(unpaidCount(page)).toHaveText('2');
  await expect(btn).toBeFocused(); // the undo button is gone; focus lands on the row's toggle
});

test('undo keeps edits made after the toggle and restores only is_paid', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180', note: 'ค่าข้าว' });
  await page.goto('/');
  await rowOf(page, row.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  const edit = await request.put(`/api/debts/${row.id}`, {
    data: { friend_name: 'ต้น', amount: '200', note: 'ค่าข้าวเย็น', is_paid: 1 },
  });
  expect(edit.status()).toBe(200);
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => isPaidOnServer(request, row.id)).toBe(0);
  const saved = await (await request.get(`/api/debts/${row.id}`)).json();
  expect(saved).toMatchObject({ note: 'ค่าข้าวเย็น', amount: '200.00', is_paid: 0 });
  await expect(rowOf(page, row.id).getByTestId('debt-amount')).toHaveText('฿200');
});

test('a failed background refresh keeps the rows and shows the error toast', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  const ton = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/?paid=0');
  await expect(page.getByTestId('debt-row')).toHaveCount(2);
  await page.route((url) => url.pathname === '/api/debts', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server_error"}' }));
  await rowOf(page, ton.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('ทำรายการไม่สำเร็จ ลองอีกครั้ง');
  await expect(page.getByTestId('debt-row')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await isPaidOnServer(request, ton.id)).toBe(1);
});

test('un-paying a row shows no toast', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180', is_paid: 1 });
  await page.goto('/');
  const btn = rowOf(page, row.id).getByTestId('check-btn');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => isPaidOnServer(request, row.id)).toBe(0);
  await expect(unpaidCount(page)).toHaveText('1');
  await expect(page.getByTestId('toast')).toHaveText('');
});

test('desktop: the row toggle switches its text and has no aria-pressed', async ({ page, request }) => {
  await page.setViewportSize(DESKTOP);
  const row = await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  await page.goto('/');
  const btn = rowOf(page, row.id).getByTestId('check-btn');
  await expect(btn).toHaveText('จ่ายแล้ว');
  await btn.click();
  await expect(toastText(page)).toHaveText('แพรว จ่ายแล้ว ฿280');
  await expect(btn).toHaveText('ยกเลิกจ่าย');
  await expect(btn).toHaveAttribute('aria-label', 'ยกเลิกการจ่ายของ แพรว');
  await expect(btn).not.toHaveAttribute('aria-pressed', /.*/);
  await expect(rowOf(page, row.id).locator('.pill')).toHaveText('จ่ายแล้ว');
  await expect(page.getByText('0 รายการ')).toBeVisible(); // รายการค้างจ่าย card from /api/summary
});

test('the unpaid filter hides a row once it is marked paid', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  const ton = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/?paid=0');
  await expect(page.getByTestId('debt-row')).toHaveCount(2);
  await rowOf(page, ton.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  await expect(rowOf(page, ton.id)).toHaveCount(0);
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  // Undo brings it back into the filtered list.
  await page.getByTestId('toast-undo').click();
  await expect(rowOf(page, ton.id)).toHaveCount(1);
});

test('Review Focus 4a: a failed PUT rolls back and offers a retry', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.route('**/api/debts/*', (route) => (route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server_error"}' })
    : route.fallback()));
  const btn = rowOf(page, row.id).getByTestId('check-btn');
  await btn.click();
  await expect(toastText(page)).toHaveText('ทำรายการไม่สำเร็จ ลองอีกครั้ง');
  await expect(page.getByTestId('toast-undo')).toHaveText('ลองใหม่');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(btn).toBeEnabled();
  expect(await isPaidOnServer(request, row.id)).toBe(0);

  // ลองใหม่ repeats the toggle once the server is back.
  await page.unroute('**/api/debts/*');
  await page.getByTestId('toast-undo').click();
  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
});

test('a 429 on toggle shows the retry_after wait', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.route('**/api/debts/*', (route) => (route.request().method() === 'PUT'
    ? route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited","retry_after":7}' })
    : route.fallback()));
  await rowOf(page, row.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('ส่งคำขอถี่เกินไป รอ 7 วินาที');
  await expect(rowOf(page, row.id).getByTestId('check-btn')).toHaveAttribute('aria-pressed', 'false');
});

test('Review Focus 4b: undo reverts only the row of the visible toast', async ({ page, request }) => {
  const a = await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  const b = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await rowOf(page, a.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('แพรว จ่ายแล้ว ฿280');
  await rowOf(page, b.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => isPaidOnServer(request, b.id)).toBe(0);
  expect(await isPaidOnServer(request, a.id)).toBe(1);
  await expect(rowOf(page, a.id).getByTestId('check-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(rowOf(page, b.id).getByTestId('check-btn')).toHaveAttribute('aria-pressed', 'false');
});

test('the toast closes by itself after 5 seconds', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.clock.install();
  await page.goto('/');
  await rowOf(page, row.id).getByTestId('check-btn').click();
  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  await page.mouse.move(0, 0); // hovering the toast would pause it
  await page.clock.runFor(4000);
  await expect(toastText(page)).toHaveText('ต้น จ่ายแล้ว ฿180');
  await page.clock.runFor(1100);
  await expect(page.getByTestId('toast')).toHaveText('');
});

// ---------- F3: delete ----------

test('mobile F3: delete from the edit view through the bottom sheet', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  const prae = await createDebt(request, { friend_name: 'แพรว', amount: '280', note: 'ค่าแท็กซี่กลับบ้าน' });
  await page.goto('/');
  await rowOf(page, prae.id).locator('a.debt__main').click();
  await expect(page).toHaveURL(new RegExp(`#/edit/${prae.id}$`));

  const openBtn = page.getByRole('button', { name: 'ลบรายการนี้' });
  await openBtn.click();
  const dialog = page.getByTestId('dialog-delete');
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveClass(/\bsheet\b/);
  await expect(page.getByRole('dialog', { name: 'ลบรายการของแพรว?' })).toBeVisible();
  await expect(dialog.locator('.sheet__handle')).toHaveAttribute('aria-hidden', 'true');
  await expect(dialog.locator('p')).toHaveText('ค่าแท็กซี่กลับบ้าน ฿280 จะหายไปจากสมุด และกู้คืนไม่ได้');
  await expect(page.getByTestId('dialog-delete-confirm')).toHaveText('ลบรายการ');
  await expect(page.getByTestId('dialog-delete-cancel')).toHaveText('ยกเลิก');
  await expect(page.getByTestId('dialog-delete-cancel')).toBeFocused();
  const box = await dialog.boundingBox();
  expect(Math.round(box.y + box.height)).toBe(MOBILE.height); // pinned to the bottom

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(openBtn).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`#/edit/${prae.id}$`));

  await openBtn.click();
  await page.getByTestId('dialog-delete-confirm').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(toastText(page)).toHaveText('ลบรายการของแพรวแล้ว');
  await expect(page.getByTestId('toast-undo')).toHaveCount(0);
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await expect(rowOf(page, prae.id)).toHaveCount(0);
  await expect(unpaidCount(page)).toHaveText('1');
  expect((await request.get(`/api/debts/${prae.id}`)).status()).toBe(404);
});

test('a note-less row says ยอด in the sheet text', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto(`/#/edit/${row.id}`);
  await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
  await expect(page.getByTestId('dialog-delete').locator('p')).toHaveText('ยอด ฿180 จะหายไปจากสมุด และกู้คืนไม่ได้');
});

test('mobile: Back with the delete sheet open closes it', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await rowOf(page, row.id).locator('a.debt__main').click();
  await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
  await expect(page.getByTestId('dialog-delete')).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/#\/edit/);
  await expect(page.locator('.dialog-layer')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('.app').inert)).toBe(false);
  await expect(rowOf(page, row.id)).toHaveCount(1);
});

test('desktop F3: the row ลบ opens a centred modal; deleting moves focus to the list heading', async ({ page, request }) => {
  await page.setViewportSize(DESKTOP);
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  const prae = await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  await page.goto('/');
  await page.getByRole('button', { name: 'ลบรายการของแพรว' }).click();

  const dialog = page.getByTestId('dialog-delete');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('dialog-delete-cancel')).toBeFocused();
  await expect(dialog.locator('.sheet__handle')).toBeHidden();
  const box = await dialog.boundingBox();
  expect(box.width).toBe(400);
  expect(Math.abs(box.x + box.width / 2 - DESKTOP.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height / 2 - DESKTOP.height / 2)).toBeLessThanOrEqual(1);
  await expect(rowOf(page, prae.id)).toHaveClass(/\bis-highlight\b/);

  // Cancel gives the highlight back.
  await page.getByTestId('dialog-delete-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(rowOf(page, prae.id)).not.toHaveClass(/\bis-highlight\b/);

  await page.getByRole('button', { name: 'ลบรายการของแพรว' }).click();
  const release = await gate(page, '**/api/debts/*', 'DELETE');
  await page.getByTestId('dialog-delete-confirm').click();
  await expect(page.getByTestId('dialog-delete-confirm')).toHaveText('กำลังลบ…');
  await expect(page.getByTestId('dialog-delete-confirm')).toBeDisabled();
  // No backing out while the DELETE is in flight: ยกเลิก, Esc and the scrim do nothing.
  await expect(page.getByTestId('dialog-delete-cancel')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('.dialog-layer .scrim').last().click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeVisible();
  release();

  await expect(dialog).toHaveCount(0);
  await expect(rowOf(page, prae.id)).toHaveCount(0);
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await expect(toastText(page)).toHaveText('ลบรายการของแพรวแล้ว');
  expect(await page.evaluate(() => document.activeElement?.matches('.page-head__title'))).toBe(true);
});

test('desktop: delete from the edit modal stacks the confirm and closes both', async ({ page, request }) => {
  await page.setViewportSize(DESKTOP);
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.locator(`[data-id="${row.id}"] a[href="#/edit/${row.id}"]`).click();
  await expect(page.getByTestId('input-friend')).toHaveValue('ต้น');
  await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
  await expect(page.locator('.dialog-layer')).toHaveCount(2);
  await expect(page.getByTestId('dialog-delete-cancel')).toBeFocused();

  await page.keyboard.press('Escape'); // only the confirm closes
  await expect(page.locator('.dialog-layer')).toHaveCount(1);
  await expect(page.getByTestId('input-friend')).toBeVisible();

  await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
  await page.getByTestId('dialog-delete-confirm').click();
  await expect(page.locator('.dialog-layer')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  await expect(toastText(page)).toHaveText('ลบรายการของต้นแล้ว');
  await expect(page.getByText('สมุดยังว่างอยู่')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('.app').inert)).toBe(false);
});

test('Review Focus 5: deleting the only row on page 2 lands on page 1', async ({ page, request }) => {
  const seed = await request.post('/api/seed?n=21&reset=1', { headers: { 'X-Test-Token': TOKEN } });
  expect(seed.status()).toBe(200);
  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=2');
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await page.locator('[data-testid="debt-row"] button[aria-label^="ลบรายการของ"]').click();
  await page.getByTestId('dialog-delete-confirm').click();
  await expect(page.locator('.pager [aria-current="page"]')).toHaveText('1');
  await expect(page.getByTestId('debt-row')).toHaveCount(20);
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('a delete that answers 404 closes and reloads without an error toast', async ({ page, request }) => {
  await page.setViewportSize(DESKTOP);
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await expect(rowOf(page, row.id)).toHaveCount(1);
  await page.route('**/api/debts/*', (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' })
    : route.fallback()));
  await page.getByRole('button', { name: 'ลบรายการของต้น' }).click();
  const reloaded = page.waitForRequest((req) => req.method() === 'GET' && /\/api\/debts\?/.test(req.url()));
  await page.getByTestId('dialog-delete-confirm').click();
  await reloaded;
  await expect(page.getByTestId('dialog-delete')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveText('');
});

// ---------- Task 10 leftovers ----------

test('an empty list under ทั้งหมด with a stale summary shows the empty book', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await expect(rowOf(page, row.id)).toHaveCount(1);
  expect((await request.delete(`/api/debts/${row.id}`)).status()).toBe(204);
  await page.getByTestId('filter-all').click(); // reloads the list only
  await expect(page.getByText('สมุดยังว่างอยู่')).toBeVisible();
  await expect(page.getByText('ไม่มีรายการยังไม่จ่าย')).toHaveCount(0);
});

test('an empty book resets a deep-linked page to 1', async ({ page }) => {
  await page.goto('/?page=3');
  await expect(page.getByText('สมุดยังว่างอยู่')).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]page=/);
});
