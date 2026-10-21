import { test, expect } from '@playwright/test';
import { NARROW, MOBILE, DESKTOP } from './helpers.js';

for (const vp of [NARROW, DESKTOP]) {
  test(`no horizontal scroll at ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    const res = await page.goto('/');
    expect(res.status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('no cross-origin requests', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const urls = [];
  page.on('request', (req) => urls.push(req.url()));
  for (const path of ['/', '/test']) {
    const res = await page.goto(path);
    expect(res.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
  }
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((u) => new URL(u).origin !== origin)).toEqual([]);
});

test('fonts are self-hosted and load', async ({ page }) => {
  const fontUrls = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.woff2')) fontUrls.push([new URL(r.url()).pathname, r.status()]);
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  // check() only reports true once a matching face is loaded, so load both families explicitly.
  const loaded = await page.evaluate(async () => {
    await Promise.all([document.fonts.load('600 16px Prompt', 'Tabby'), document.fonts.load('400 16px "Noto Sans Thai"', 'ก')]);
    return [document.fonts.check('600 16px Prompt'), document.fonts.check('400 16px "Noto Sans Thai"', 'ก')];
  });
  expect(loaded).toEqual([true, true]);
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const [path, status] of fontUrls) {
    expect(path).toMatch(/^\/static\/fonts\//);
    expect(status).toBe(200);
  }
});

test('sidebar only ≥900px, topbar only <900px', async ({ page }) => {
  for (const path of ['/', '/test']) {
    await page.setViewportSize(MOBILE);
    await page.goto(path);
    await expect(page.locator('nav.sidebar')).toBeHidden();
    await expect(page.locator('header.topbar')).toBeVisible();
    await expect(page.locator('h1:visible')).toHaveCount(1);

    await page.setViewportSize({ width: 899, height: 800 });
    await expect(page.locator('nav.sidebar')).toBeHidden();
    await expect(page.locator('header.topbar')).toBeVisible();

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.locator('nav.sidebar')).toBeVisible();
    await expect(page.locator('header.topbar')).toBeHidden();
    await expect(page.locator('h1:visible')).toHaveCount(1);
  }
});

test('index shell exposes the mount points and fixed structure', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    'width=device-width, initial-scale=1, viewport-fit=cover',
  );
  await expect(page.locator('nav.sidebar.on-dark[aria-label="เมนูหลัก"]')).toHaveCount(1);
  await expect(page.locator('header.topbar a[href="/test"][aria-label="ทดสอบระบบ"]')).toHaveCount(1);
  await expect(page.locator('main#main[tabindex="-1"]')).toHaveCount(1);
  for (const sel of ['#view-list', '#view-form[hidden]', '#dialog-root', '#toast-root']) {
    await expect(page.locator(sel)).toHaveCount(1);
  }
  await expect(page.locator('script[type="module"][src="/static/js/app.js"]')).toHaveCount(1);
  for (const h1 of await page.locator('h1').all()) await expect(h1).toHaveAttribute('tabindex', '-1');
});

test('no element has a style attribute in served HTML', async ({ request }) => {
  for (const path of ['/', '/test']) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(/ style="/.test(await res.text())).toBe(false);
  }
});

test('/test sidebar link has aria-current=page', async ({ page }) => {
  await page.goto('/test');
  await expect(page.locator('nav.sidebar a[aria-current="page"]')).toHaveText('ทดสอบระบบ');
  await expect(page.locator('nav.sidebar a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('script[type="module"][src="/static/js/test.js"]')).toHaveCount(1);
});
