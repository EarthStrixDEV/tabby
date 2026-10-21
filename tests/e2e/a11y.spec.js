// Acceptance checks from DESIGN §9: touch targets, labels, emoji, 200% zoom, keyboard F1,
// reduced motion, and no board sample data in the served front end.
import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKEN } from '../helpers/http.js';
import { MOBILE, DESKTOP, resetDb, createDebt } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicDir = join(root, 'shared', 'public');

/** Every text file under shared/public, as a URL path (fonts and other binaries are skipped). */
function servedTextPaths(exts) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.includes(extname(entry.name))) out.push('/' + relative(publicDir, full).replaceAll('\\', '/'));
    }
  };
  walk(publicDir);
  return out;
}

/** Fetches each path from the running server and returns [{ path, text }]. */
async function fetchServed(request, paths) {
  const out = [];
  for (const path of paths) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    out.push({ path, text: await res.text() });
  }
  return out;
}

/**
 * Interactive elements smaller than 44x44 on the current page. Excluded: hidden elements
 * (display:none, [hidden], visibility), visually hidden ones (.sr-only), and text links inside
 * a paragraph. The disabled pager step is a <span aria-disabled>, so the selector never matches it.
 */
function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a, [role=button], input, select')) {
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      if (el.closest('.sr-only')) continue;
      if (el.tagName === 'A' && el.closest('p')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        const id = el.dataset.testid || el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30);
        bad.push(`${el.tagName.toLowerCase()} "${id}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return bad;
  });
}

/** Every input and select (visible or not) that has no <label for> pointing at it. */
function unlabelledFields(page) {
  return page.evaluate(() => [...document.querySelectorAll('input, select')]
    .filter((el) => !el.id || !document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
    .map((el) => el.outerHTML.slice(0, 80)));
}

async function seedPages(request) {
  const res = await request.post('/api/seed?n=25&reset=1', { headers: { 'X-Test-Token': TOKEN } });
  expect(res.status()).toBe(200);
}

/** The views to audit: the list (with rows and a pager), the add form, and /test. */
const VIEWS = [
  { name: 'list', path: '/', ready: (page) => expect(page.getByTestId('debt-row').first()).toBeVisible() },
  { name: 'form', path: '/#/new', ready: (page) => expect(page.getByTestId('input-friend')).toBeVisible() },
  { name: 'test', path: '/test', ready: (page) => expect(page.getByTestId('token-input')).toBeVisible() },
];

test.describe('touch targets and labels', () => {
  test.beforeEach(async ({ request }) => {
    await resetDb();
    await seedPages(request);
  });

  for (const [vpName, viewport] of [['mobile', MOBILE], ['desktop', DESKTOP]]) {
    for (const view of VIEWS) {
      test(`${view.name} on ${vpName}: every target is at least 44x44`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(view.path);
        await view.ready(page);
        if (view.name === 'list') await expect(page.getByTestId('pager-next')).toBeVisible();
        expect(await smallTargets(page)).toEqual([]);
      });
    }
  }

  for (const view of VIEWS) {
    test(`${view.name}: every input and select has a <label for>`, async ({ page }) => {
      await page.goto(view.path);
      await view.ready(page);
      expect(await unlabelledFields(page)).toEqual([]);
    });
  }
});

test('no emoji in the served HTML, JS or CSS', async ({ request }) => {
  const files = await fetchServed(request, servedTextPaths(['.html', '.js', '.css', '.txt']));
  expect(files.length).toBeGreaterThan(5);
  const hits = files.filter((f) => /\p{Extended_Pictographic}/u.test(f.text)).map((f) => f.path);
  expect(hits).toEqual([]);
});

test('no board sample data in the served HTML or JS; SEED_NAMES stays in PHP', async ({ request }) => {
  const files = await fetchServed(request, servedTextPaths(['.html', '.js']));
  // Thai names as standalone tokens: no Thai letter right before or after, so "เริ่มต้น" does not match "ต้น".
  const notThai = '[^\\u0E00-\\u0E7F]';
  const samples = [
    ['ต้น', new RegExp(`(^|${notThai})ต้น(?=${notThai}|$)`)],
    ['แพรว', new RegExp(`(^|${notThai})แพรว(?=${notThai}|$)`)],
    ['฿12,345', /฿12,345/],
    ['48.2', /(^|[^\d.])48\.2(?!\d)/],
    ['SEED_NAMES', /SEED_NAMES/],
  ];
  const hits = [];
  for (const f of files) {
    for (const [label, re] of samples) if (re.test(f.text)) hits.push(`${f.path}: ${label}`);
  }
  expect(hits).toEqual([]);
});

test.describe('200% zoom (640x400 CSS px at deviceScaleFactor 2)', () => {
  test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });

  test.beforeEach(async ({ request }) => {
    await resetDb();
    await seedPages(request);
  });

  for (const view of VIEWS) {
    test(`${view.name} has no horizontal scroll`, async ({ page }) => {
      await page.goto(view.path);
      await view.ready(page);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});

/** Presses Tab until the element with this test id has focus (at most 40 presses). */
async function tabTo(page, testid) {
  const target = page.getByTestId(testid);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${testid}`);
}

test('keyboard-only F1 on mobile: Tab to the FAB, fill the form, Enter on บันทึก', async ({ page, request }) => {
  await resetDb();
  await createDebt(request, { friend_name: 'มายด์', amount: '90' });
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await expect(page.getByTestId('debt-row')).toHaveCount(1);

  await tabTo(page, 'fab-add');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/new$/);

  await tabTo(page, 'input-friend');
  await page.keyboard.type('โอ๊ต');
  await tabTo(page, 'input-amount');
  await page.keyboard.type('120');
  await tabTo(page, 'btn-save');
  await expect(page.getByTestId('btn-save')).toHaveText('บันทึก');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('debt-row')).toHaveCount(2);
  await expect(page.getByTestId('debt-name').first()).toHaveText('โอ๊ต');
  await expect(page.getByTestId('debt-amount').first()).toHaveText('฿120');
});

test('prefers-reduced-motion: reduce turns transitions off', async ({ page, request }) => {
  await resetDb();
  await createDebt(request, { friend_name: 'มายด์', amount: '90' });
  const durations = () => page.evaluate(() => ({
    toast: getComputedStyle(document.querySelector('.toast')).transitionDuration,
    check: getComputedStyle(document.querySelector('.check-btn')).transitionDuration,
  }));

  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByTestId('debt-row')).toHaveCount(1);
  // Control: the tick button animates its background when motion is allowed.
  expect((await durations()).check).not.toBe('0s');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await durations()).toEqual({ toast: '0s', check: '0s' });
});
