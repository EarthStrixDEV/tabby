import { test, expect } from '@playwright/test';
import { MOBILE, DESKTOP, resetDb, createDebt } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.setViewportSize(MOBILE);
});

const formHeading = (page) => page.locator('#view-form h1');

test('mobile F1: FAB opens the form, chips fill it, saving highlights the new row and toasts', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  await page.goto('/');
  await page.getByTestId('fab-add').click();

  await expect(page).toHaveURL(/#\/new$/);
  await expect(formHeading(page)).toHaveText('เพิ่มรายการ');
  await expect(formHeading(page)).toBeFocused();
  await expect(page.getByTestId('fab-add')).toBeHidden();
  await expect(page.locator('#view-list')).toBeHidden();
  await expect(page.locator('#view-form a[aria-label="กลับไปรายการหนี้"]')).toHaveAttribute('href', '#/');

  await page.getByRole('button', { name: '+100', exact: true }).click();
  await page.getByRole('button', { name: '+100', exact: true }).click();
  await expect(page.getByTestId('input-amount')).toHaveValue('200');

  await page.getByTestId('input-friend').fill('ต้น');
  await page.getByTestId('btn-save').click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('debt-name').first()).toHaveText('ต้น');
  await expect(page.getByTestId('debt-amount').first()).toHaveText('฿200');
  await expect(page.getByTestId('debt-row').first()).toHaveClass(/\bis-highlight\b/);
  await expect(page.getByTestId('toast')).toHaveText('เพิ่มรายการของต้นแล้ว');
  await expect(page.getByTestId('toast')).toHaveAttribute('role', 'status');
});

test('a name chip fills the name and moves focus to the amount', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'แพรว', amount: '280' });
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await createDebt(request, { friend_name: 'แพรว', amount: '50' });
  await page.goto('/');
  await expect(page.getByTestId('debt-row')).toHaveCount(3);
  await page.getByTestId('fab-add').click();
  const chips = page.locator('#view-form .chips').first().locator('.chip');
  await expect(chips).toHaveText(['แพรว', 'ต้น']);
  await chips.nth(1).click();
  await expect(page.getByTestId('input-friend')).toHaveValue('ต้น');
  await expect(page.getByTestId('input-amount')).toBeFocused();
});

test('no name chips when no rows are loaded', async ({ page }) => {
  await page.goto('/#/new');
  await expect(page.getByTestId('input-friend')).toBeVisible();
  await expect(page.locator('#view-form .chip')).toHaveText(['+50', '+100', '+500', '+1000']);
});

test('saving an empty form shows the name error and focuses the name field', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByTestId('btn-save').click();
  const friend = page.getByTestId('input-friend');
  await expect(page.getByTestId('error-friend')).toHaveText('กรอกชื่อเพื่อน');
  await expect(friend).toHaveAttribute('aria-invalid', 'true');
  const errId = await page.getByTestId('error-friend').getAttribute('id');
  await expect(friend).toHaveAttribute('aria-describedby', errId);
  await expect(page.locator('#view-form .field').first()).toHaveClass(/\bis-invalid\b/);
  await expect(friend).toBeFocused();
  await expect(page).toHaveURL(/#\/new$/);
});

test('a non-numeric amount shows the amount error', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByTestId('input-friend').fill('ต้น');
  await page.getByTestId('input-amount').fill('abc');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('error-amount')).toHaveText('กรอกจำนวนเงินเป็นตัวเลข เช่น 150');
  await expect(page.getByTestId('input-amount')).toBeFocused();
  await expect(page.getByTestId('error-friend')).toBeHidden();
});

test('a server 422 shows fields.* under the matching field', async ({ page }) => {
  await page.route('**/api/debts', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'validation_failed', fields: { amount: 'ต้องมากกว่า 0' } }),
    });
  });
  await page.goto('/#/new');
  await page.getByTestId('input-friend').fill('ต้น');
  await page.getByTestId('input-amount').fill('150');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('error-amount')).toHaveText('ต้องมากกว่า 0');
  await expect(page.getByTestId('input-amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('input-amount')).toBeFocused();
  await expect(page.getByTestId('btn-save')).toHaveText('บันทึก');
  await expect(page.getByTestId('btn-save')).toBeEnabled();
});

test('edit: a row opens a prefilled form, saving keeps is_paid', async ({ page, request }) => {
  const row = await createDebt(request, { friend_name: 'มีน', amount: '95', note: 'ค่ากาแฟ', is_paid: 1 });
  await page.goto('/');
  await page.locator(`[data-id="${row.id}"] .debt__main`).click();

  await expect(page).toHaveURL(new RegExp(`#/edit/${row.id}$`));
  await expect(formHeading(page)).toHaveText('แก้ไขรายการ');
  await expect(page.getByTestId('input-friend')).toHaveValue('มีน');
  await expect(page.getByTestId('input-amount')).toHaveValue('95');
  await expect(page.getByTestId('input-note')).toHaveValue('ค่ากาแฟ');
  await expect(page.getByRole('button', { name: 'ลบรายการนี้' })).toBeVisible();

  await page.getByTestId('input-note').fill('ค่ากาแฟเย็น');
  await page.getByTestId('btn-save').click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator(`[data-id="${row.id}"] .debt__note`)).toHaveText('ค่ากาแฟเย็น');
  await expect(page.locator(`[data-id="${row.id}"]`)).toHaveClass(/\bis-highlight\b/);
  await expect(page.getByTestId('toast')).toBeEmpty();

  const res = await request.get(`/api/debts/${row.id}`);
  const saved = await res.json();
  expect(Number(saved.is_paid)).toBe(1);
  expect(saved.note).toBe('ค่ากาแฟเย็น');
});

test('deep link to a missing id returns to the list without errors', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/#/edit/999999');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await expect(page.locator('#view-form')).toBeHidden();
  expect(errors).toEqual([]);
});

test('deep link to an existing row that is not on the current page prefills the form', async ({ page, request }) => {
  const first = await createDebt(request, { friend_name: 'โอ๊ต', amount: '420', note: 'ตั๋วหนัง' });
  for (let i = 0; i < 20; i++) await createDebt(request, { friend_name: `เพื่อน${i}`, amount: '10' });
  await page.goto(`/#/edit/${first.id}`);
  await expect(formHeading(page)).toHaveText('แก้ไขรายการ');
  await expect(page.getByTestId('input-friend')).toHaveValue('โอ๊ต');
  await expect(page.getByTestId('input-amount')).toHaveValue('420');
  await expect(page.getByTestId('input-note')).toHaveValue('ตั๋วหนัง');
});

test('browser back from #/new returns to the list', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.getByTestId('fab-add').click();
  await expect(page.getByTestId('input-friend')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/$|\/$/);
  await expect(page.locator('#view-form')).toBeHidden();
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
});

test('desktop: the add modal has no chips, Esc and the scrim close it', async ({ page, request }) => {
  await page.setViewportSize(DESKTOP);
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  const opener = page.locator('.page-head a[href="#/new"]');
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'เพิ่มรายการ' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('input-friend')).toBeFocused();
  await expect(page.locator('.chip')).toHaveCount(0);
  await expect(page.getByTestId('debt-row')).toHaveCount(1); // the list stays behind the modal

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page).toHaveURL(/#\/$/);

  await opener.click();
  await expect(dialog).toBeVisible();
  await page.locator('.scrim').click({ position: { x: 10, y: 10 } });
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
});

test('desktop: Tab stays inside the modal and saving closes it with a highlight', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/#/new');
  const dialog = page.getByRole('dialog', { name: 'เพิ่มรายการ' });
  await expect(page.getByTestId('input-friend')).toBeFocused();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.getByTestId('input-friend').fill('แพรว');
  await page.getByTestId('input-amount').fill('280');
  await page.getByTestId('btn-save').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('debt-row').first()).toHaveClass(/\bis-highlight\b/);
  await expect(page.getByTestId('toast')).toHaveText('เพิ่มรายการของแพรวแล้ว');
});

test('mobile: Back after ยกเลิก does not reopen the form', async ({ page, request }) => {
  await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.getByTestId('fab-add').click();
  await expect(page.getByTestId('input-friend')).toBeVisible();
  await page.getByTestId('btn-cancel').click();
  await expect(page.locator('#view-form')).toBeHidden();
  await page.goBack();
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await expect(page).not.toHaveURL(/#\/(new|edit)/);
  await expect(page.locator('#view-form')).toBeHidden();
});

test('desktop: Back after closing or saving the modal does not reopen it', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.locator('.page-head a[href="#/new"]').click();
  await page.getByRole('button', { name: 'ปิด' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.page-head a[href="#/new"]').click();
  await page.getByTestId('input-friend').fill('ต้น');
  await page.getByTestId('input-amount').fill('180');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  await page.goBack();
  await expect(page).not.toHaveURL(/#\/(new|edit)/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('desktop: Back with a dialog stacked over the edit modal closes both and clears inert', async ({ page, request }) => {
  await page.setViewportSize(DESKTOP);
  const row = await createDebt(request, { friend_name: 'ต้น', amount: '180' });
  await page.goto('/');
  await page.locator(`[data-id="${row.id}"] a[href="#/edit/${row.id}"]`).click();
  await expect(page.getByTestId('input-friend')).toHaveValue('ต้น');
  const stacked = await page.evaluate(async () => {
    const { openDialog } = await import('/static/js/ui/dialog.js');
    const sheet = document.createElement('div');
    sheet.setAttribute('data-testid', 'stacked');
    const btn = document.createElement('button');
    btn.textContent = 'ยกเลิก';
    sheet.appendChild(btn);
    openDialog(sheet, { kind: 'sheet', initialFocus: btn });
    const layers = [...document.querySelectorAll('.dialog-layer')];
    return { app: document.querySelector('.app').inert, layers: layers.map((l) => l.inert) };
  });
  expect(stacked).toEqual({ app: true, layers: [true, false] });

  await page.goBack(); // the route closes only the lower (form) dialog
  await expect(page.locator('.dialog-layer')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('.app').inert)).toBe(false);
  await page.getByTestId('filter-all').click(); // the page is usable again
  await expect(page.getByTestId('filter-all')).toBeFocused();
});

test('deep link that fails with a server error returns to the list with an error toast', async ({ page }) => {
  await page.route('**/api/debts/4242', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'server_error' }) }));
  await page.goto('/#/edit/4242');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('toast')).toHaveText('ทำรายการไม่สำเร็จ ลองอีกครั้ง');
  await expect(page.locator('#view-form')).toBeHidden();
});

test('a 422 with no field the form can show falls back to the error toast', async ({ page }) => {
  await page.route('**/api/debts', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'validation_failed', fields: { is_paid: 'ต้องเป็น 0 หรือ 1' } }),
    });
  });
  await page.goto('/#/new');
  await page.getByTestId('input-friend').fill('ต้น');
  await page.getByTestId('input-amount').fill('150');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('toast')).toHaveText('ทำรายการไม่สำเร็จ ลองอีกครั้ง');
  await expect(page.getByTestId('btn-save')).toBeEnabled();
  await expect(page).toHaveURL(/#\/new$/);
});
