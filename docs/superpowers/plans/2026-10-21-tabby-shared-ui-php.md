# Tabby (Shared UI + PHP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Tabby's shared front-end (`/`, `/test`) and the PHP backend (one codebase for Apache and Nginx) that implements every endpoint in the Spec, plus `schema.sql` and the Nginx routing snippet.

**Architecture:** One static front-end in `shared/public/` (vanilla ES modules, no build step) talks to a same-origin JSON API. The PHP backend uses a single front controller (`index.php`), a small router, and one file per concern under `apache/src/`. `scripts/assemble.mjs` copies `shared/public` and `apache/` into `dist/php/` (the deploy artifact and the local docroot), so static files stay byte-identical. One black-box HTTP contract suite (`tests/contract/`, `node:test` + `fetch`) pins the API. It runs against any `BASE_URL`, so the Node and Python stacks can reuse it later.

**Tech Stack:** PHP 8.x + PDO MySQL (Laragon locally), MySQL/MariaDB, HTML + CSS + vanilla JS (ES modules), Node 20+ for tests only (`node:test`, `@playwright/test`, `@fontsource/*` as devDependencies; none of them ship).

**Spec:**
- Backend/API: `design-handoff/SPEC-tabby.txt` (plain-text export of Claude Doc `Spec: Tabby (SWH Test App)`, id `3b70e9a5-d40d-4820-9823-f9b1afac65da`). Code blocks such as the SQL, JSON samples, and folder tree are quoted in this plan because the export dropped them.
- UI: `design-handoff/design-handoff/DESIGN-tabby.md`, tokens `design-handoff/design-handoff/tokens/tabby.css`, boards `design-handoff/design-handoff/reference-boards/Tabby-*.dc.html` + `Main.dc.html`.
- Priority on conflict: Spec > DESIGN-tabby.md > boards.

**Out of scope for this plan:** Node/Express and Python/Flask stacks, `RESULTS.md`, and deployment to SWH. They belong in a follow-up plan that reuses `tests/contract/`.

## Global Constraints

- No build step, no UI framework, no CDN, no external requests from the page. Browser JS is native ES modules (`<script type="module">`).
- The `shared/public/**` files are copied verbatim into every stack. They are never templated and contain no stack-specific logic.
- Front-end layout (decided): `shared/public/{index.html,test.html,robots.txt}` + `shared/public/static/{css/style.css, js/app.js, js/test.js, js/lib/*.js, fonts/*}`.
- All UI copy is Thai, copied verbatim from DESIGN-tabby.md. Do not translate or reword it. Icons are inline SVG; no emoji anywhere.
- No `style=""` attributes in HTML. The only exception is runtime-computed geometry: progress width and histogram bar height go through SVG attributes or `el.style.setProperty('--pct', …)`.
- Token names and values come from `tokens/tabby.css`, pasted unchanged at the top of `style.css`. One breakpoint only: `@media (min-width: 900px)`. The page must work from 360px wide.
- Touch targets are ≥ 44×44px. Text contrast is ≥ 4.5:1 and UI contrast ≥ 3:1. Input borders use `--border-strong` (1.5px). Progress fill uses `--accent-ui`. Focus ring: `outline: 3px solid var(--ink)`, or `var(--on-dark)` on dark surfaces.
- Money stays a string from the API (`"150.00"`). Client arithmetic uses integer satang only. Totals come from `/api/summary`; the client never sums amounts.
- API times are UTC ISO 8601 with a trailing `Z`. Display uses `Asia/Bangkok` and the Buddhist calendar (`th-TH-u-ca-buddhist`).
- DOM text goes in via `textContent`/`createElement`. `friend_name`, `note`, and any API string never go through `innerHTML`.
- PHP: 8.x, PDO MySQL, prepared statements everywhere, `charset=utf8mb4`, and `SET time_zone = '+00:00'` on connect. JSON is encoded with `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`. No `ob_gzhandler`.
- Every `/api/*` response carries `X-Stack: <APP_STACK>` and `Server-Timing: app;dur=<ms>`. Every PHP response carries `X-Robots-Tag: noindex`. No CORS headers.
- Error bodies use exactly the Spec §5 codes: `invalid_json`, `bad_params`, `not_found`, `method_not_allowed`, `validation_failed` (+ `fields`), `rate_limited` (+ `retry_after`), `payload_too_large`, `forbidden`, `server_error`. They never include stack traces, paths, or DB details.
- Token-guarded endpoints (`X-Test-Token`, compared with `hash_equals`): `GET /download/{mb}`, `POST /upload`, `POST|DELETE /api/seed`, `GET /api/slow`, `DELETE /api/cache`.
- Caps enforced in code: download 100 MB, upload 100 MB, slow 10,000 ms, seed 10,000 rows, echo body 1 MB. The load-test UI caps at 1,000 requests and 50 concurrent.
- Config (`DB_HOST, DB_NAME, DB_USER, DB_PASS, APP_STACK, CACHE_DIR, TEST_TOKEN`) lives outside the docroot (`dist/php/config.php`). It is never committed; only `apache/config.sample.php` is.
- Local tooling: Laragon's `php` and `mysql` must be on PATH (Laragon → Menu → Tools → Path → Add Laragon to Path). The local DB is `tb_local`, user `root`, empty password.

## Review Focus

1. **Thai names with leading vowels, combining marks, or emoji.** "แพรว" must show the avatar initial "พ", not "แ" (the DESIGN §4.3 example confirms this). "เอิร์ธ 🐱" must round-trip through MySQL unchanged, and a 100-character Thai name must be accepted, not rejected by a byte count. Pinned in Task 2 (contract round-trip + `mb_strlen`) and Task 8 (`initialOf`).
2. **Amount input forms people actually type.** `" 150 "`, `"1,000"`, `"150."`, `".5"`, `"0.001"`, `"99999999.99"`, `"100000000"`, `"-5"`, `"1e3"`. Client and server must agree on accept/reject, and accepted values are sent normalized. Pinned in Task 2 (contract matrix) and Task 8 (`parseAmountInput`).
3. **Deep link or refresh on `#/edit/{id}`** for a row that is not loaded, was deleted, or never existed. The page must not crash or show a blank form: it fetches the row, and on 404 returns to `#/` and refreshes. Pinned in Task 11 (e2e).
4. **A failed toggle and an undo after the toast was replaced.** A PUT that fails must roll the row back. Undo must target the row named in the visible toast, not an earlier one. Pinned in Task 12 (e2e with route interception).
5. **Pages that stop existing.** After deleting the last row of page 3, the UI steps back to page 2. The API rejects `page=0`, `per_page=101`, `paid=2`, and `page=abc` with 400 `bad_params`, and returns an empty `data` with the real `total` for a page past the end. Pinned in Task 2 (contract) and Task 12 (e2e).

---

### Task 1: Scaffold, schema, PHP core, `/api/ping`

**Files:**
- Create: `.gitignore` (`node_modules/`, `dist/`, `apache/config.php`, `test-results/`, `playwright-report/`)
- Create: `package.json` (`"type": "module"`, `"private": true`, scripts below, devDependencies added in later tasks)
- Create: `shared/schema.sql`
- Create: `apache/config.sample.php`, `apache/config.php` (local, gitignored)
- Create: `apache/public/index.php`
- Create: `apache/src/bootstrap.php`, `apache/src/Http.php`, `apache/src/Router.php`, `apache/src/Db.php`, `apache/src/routes.php`, `apache/src/handlers/ping.php`
- Create: `scripts/assemble.mjs`, `scripts/db-reset.mjs`
- Create: `tests/helpers/http.js`, `tests/contract/ping.test.js`

**Interfaces:**
- Produces (PHP, used by every later backend task):
  - `final class HttpError extends Exception { __construct(public int $status, public string $errorCode, public array $extra = [], public array $headers = []) }`. Throw it from any handler; `index.php` turns it into `{"error": errorCode, ...extra}`.
  - `Http::json(int $status, ?array $body, array $headers = []): void`. A `null` body or status 204 sends no body. It adds the common headers.
  - `Http::commonHeaders(): void`. Sends `X-Stack`, `X-Robots-Tag: noindex`, and `Server-Timing: app;dur=<ms since TABBY_T0, 1 decimal>`.
  - `Http::jsonBody(): array`. Decodes `php://input` as a JSON **object** or throws `HttpError(400,'invalid_json')`.
  - `Http::query(string $key): ?string`
  - `Router::add(string $method, string $pattern, callable $handler): void`. `{id}` matches `[1-9][0-9]*`, `{mb}` matches `[0-9]+`, and params reach the handler as `array $params`.
  - `Router::dispatch(string $method, string $path): void`. An unknown path throws 404 `not_found`. A known path with the wrong method throws 405 `method_not_allowed` plus an `Allow` header.
  - `Db::pdo(): PDO` (lazy singleton) and `cfg(string $key): string` (reads the loaded config).
  - Constant `TABBY_T0` (`hrtime(true)` taken at the top of `index.php`).
- Produces (scripts/tests):
  - `node scripts/assemble.mjs`. Wipes `dist/php/`, then copies `shared/public/**` → `dist/php/public/`, `apache/public/**` → `dist/php/public/`, `apache/src/**` → `dist/php/src/`, and `apache/config.php` → `dist/php/config.php` if it exists.
  - `node scripts/db-reset.mjs`. Runs `mysql -uroot -e "DROP DATABASE IF EXISTS tb_local; CREATE DATABASE tb_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"` then loads `shared/schema.sql`. The binary comes from `MYSQL_BIN`, default `mysql`.
  - `tests/helpers/http.js`: `export const BASE_URL` (env, default `http://127.0.0.1:8080`), `export const TOKEN` (env `TEST_TOKEN`, default `local-test-token-0123456789abcdef`), and `export async function api(method, path, {json, headers, body} = {}) → {status, headers, json, text}`.
  - npm scripts: `assemble`, `db:reset`, `serve` (`npm run assemble && php -S 127.0.0.1:8080 -t dist/php/public dist/php/public/index.php`), `test:contract` (`node --test tests/contract/`), `test:unit` (`node --test tests/unit/`), `test:e2e` (`playwright test`).

- [ ] **Step 1: `git init`, write `.gitignore` and `package.json`, commit an empty scaffold**

- [ ] **Step 2: Write `shared/schema.sql`** with the Spec §3 SQL verbatim, plus `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` on both tables. The SWH default charset can be latin1, which corrupts Thai. Note this deviation from the Spec in a SQL comment.

```sql
CREATE TABLE debts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  friend_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  note VARCHAR(255) NULL,
  is_paid TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_paid_created (is_paid, created_at),
  KEY idx_friend (friend_name)
);
CREATE TABLE rate_limits (
  ip VARCHAR(45) NOT NULL,
  window_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);
```

- [ ] **Step 3: Write the failing contract test `tests/contract/ping.test.js`**

```js
test('GET /api/ping', async () => {
  const r = await api('GET', '/api/ping');
  assert.equal(r.status, 200);
  assert.equal(r.json.pong, true);
  assert.equal(r.json.stack, r.headers.get('x-stack'));
  assert.equal(typeof r.json.unix_ms, 'number');
  assert.match(r.headers.get('server-timing'), /^app;dur=\d+(\.\d+)?$/);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.match(r.headers.get('content-type'), /^application\/json; charset=utf-8/);
});
test('GET /api/ping?db=1 adds db_ms', async () => { /* status 200, typeof db_ms === 'number' */ });
test('unknown /api path → 404 not_found', async () => { /* GET /api/nope → 404 {error:'not_found'} */ });
test('wrong method → 405', async () => { /* PATCH /api/ping → 405 {error:'method_not_allowed'}, Allow header contains GET */ });
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run db:reset && npm run serve` (second terminal), then `npm run test:contract`
Expected: FAIL. The connection is refused or returns 404 because `index.php` does not exist yet.

- [ ] **Step 5: Implement the PHP core**

`apache/config.sample.php` returns an array with the seven keys and placeholder values. The local `apache/config.php` holds `DB_HOST=127.0.0.1`, `DB_NAME=tb_local`, `DB_USER=root`, `DB_PASS=''`, `APP_STACK=apache`, `CACHE_DIR=<repo>/dist/cache`, and `TEST_TOKEN=local-test-token-0123456789abcdef`.

`index.php` does the following in order:
1. Sets `TABBY_T0`.
2. If `PHP_SAPI === 'cli-server'`: when the path maps to an existing file, `return false`. It maps `/` → `index.html` and `/test` → `test.html` via `readfile` with `Content-Type: text/html; charset=utf-8`. Apache and Nginx do this mapping themselves in Task 7.
3. Requires `../src/bootstrap.php`, which loads `../config.php` and registers an exception handler. The handler writes the throwable to `error_log`, then sends 500 `{"error":"server_error"}`.
4. Requires `routes.php`.
5. Dispatches inside a `try` that catches `HttpError`.

`Router::dispatch` derives the path from `parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)`. `/api/ping` returns `{"pong": true, "stack": cfg('APP_STACK'), "unix_ms": int}`; with `db=1` it also runs `SELECT 1` and adds `db_ms` (float, 1 decimal).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:contract`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scaffold, schema, PHP core and /api/ping"
```

---

### Task 2: Debts CRUD API + validation

**Files:**
- Create: `apache/src/Validation.php`, `apache/src/DebtRepo.php`, `apache/src/handlers/debts.php`
- Modify: `apache/src/routes.php`
- Test: `tests/contract/debts.test.js`, `tests/contract/validation.test.js`

**Interfaces:**
- Consumes: `HttpError`, `Http::*`, `Router`, `Db::pdo()` from Task 1.
- Produces:
  - `validate_debt(mixed $input): array`. Returns `[?array $clean, array $errors]`. `$clean` holds `friend_name` (trimmed string), `amount` (normalized `"150.00"` string), `note` (`?string`; an empty string after trim becomes `null`), and `is_paid` (`0|1`).
  - `DebtRepo::format(array $row): array`. Returns `id` int, `friend_name`, `amount` string with 2 decimals, `note` (`?string`), `is_paid` int, and `created_at`/`updated_at` as `Y-m-d\TH:i:s\Z`.
  - `DebtRepo::list(int $page, int $perPage, ?int $paid): array{data: array, total: int}`. Ordered by `id DESC`.
  - `DebtRepo::find(int $id): ?array`, `DebtRepo::create(array $clean): array`, `DebtRepo::update(int $id, array $clean): ?array`, `DebtRepo::delete(int $id): bool`
  - The hook `on_debts_changed(): void` is a no-op here; Task 3 wires it to cache invalidation. Call it after every create, update, delete, and seed.

Fixed validation messages (every stack must match exactly; they get added to the Spec in Task 3):

| field | condition | message |
|---|---|---|
| `friend_name` | missing, not a string, or empty after trim | `ห้ามว่าง` |
| `friend_name` | `mb_strlen` > 100 | `ยาวเกิน 100 ตัวอักษร` |
| `amount` | missing, or not a number/numeric string matching `^-?\d+(\.\d+)?$` after trim | `ต้องเป็นตัวเลข` |
| `amount` | ≤ 0 | `ต้องมากกว่า 0` |
| `amount` | more than 2 decimals | `ทศนิยมไม่เกิน 2 ตำแหน่ง` |
| `amount` | > 99999999.99 | `ต้องไม่เกิน 99,999,999.99` |
| `note` | present, not null, and not a string | `ต้องเป็นข้อความ` |
| `note` | `mb_strlen` > 255 | `ยาวเกิน 255 ตัวอักษร` |
| `is_paid` | present and not `0`/`1` (int or bool) | `ต้องเป็น 0 หรือ 1` |

Check the amount rules in table order and report only the first failing rule per field. A JSON number amount is converted with `(string)` after `ini_set('serialize_precision','-1')`. Compare amounts as strings or integer satang, never as floats. Commas are not accepted by the API (`"1,000"` → `ต้องเป็นตัวเลข`); the client strips them (Task 8).

- [ ] **Step 1: Write the failing tests**

`debts.test.js` must cover:
- create → 201 with the full row shape (`amount === "150.00"`, `is_paid === 0`, both `created_at` and `updated_at` matching `/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/`)
- read → 200, and a missing id → 404 `not_found`
- PUT replaces every field (it sends `is_paid: 1` and drops `note`, and the result has `note === null`) → 200
- PUT on a missing id → 404
- DELETE → 204 with an empty body, and a second DELETE → 404
- list ordered by id desc, `per_page` default 20, `{data,page,per_page,total}` envelope, `paid=0|1` filters
- `page` past the end → 200 with empty `data` and the real `total`
- `page=0`, `page=abc`, `per_page=0`, `per_page=101`, `paid=2` → 400 `bad_params`
- Review Focus 1: name `"เอิร์ธ 🐱"` round-trips exactly; a 100-character Thai name (`'ก'.repeat(100)`) → 201; 101 characters → 422 `fields.friend_name === 'ยาวเกิน 100 ตัวอักษร'`
- `/api/debts/0` and `/api/debts/abc` → 404

`validation.test.js` (table-driven, POST):

```js
const cases = [
  [{ friend_name: '  ', amount: '10' }, 'friend_name', 'ห้ามว่าง'],
  [{ friend_name: 'a', amount: '0' }, 'amount', 'ต้องมากกว่า 0'],
  [{ friend_name: 'a', amount: '-5' }, 'amount', 'ต้องมากกว่า 0'],
  [{ friend_name: 'a', amount: '1.005' }, 'amount', 'ทศนิยมไม่เกิน 2 ตำแหน่ง'],
  [{ friend_name: 'a', amount: '100000000' }, 'amount', 'ต้องไม่เกิน 99,999,999.99'],
  [{ friend_name: 'a', amount: '1e3' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '1,000' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '10', note: 'x'.repeat(256) }, 'note', 'ยาวเกิน 255 ตัวอักษร'],
  [{ friend_name: 'a', amount: '10', is_paid: 2 }, 'is_paid', 'ต้องเป็น 0 หรือ 1'],
];
// each → 422 {error:'validation_failed', fields:{[field]: msg}}
// accepted (201): ' 150 ' → amount "150.00"; 150.5 (JSON number) → "150.50"; '99999999.99' → "99999999.99"; '0.5' → "0.50"
// rejected 422 ต้องเป็นตัวเลข: '.5', '150.'
// invalid JSON body '{"a":' → 400 invalid_json; JSON array body '[1]' → 400 invalid_json
```

The regex needs a digit on each side of the dot, so the server rejects `".5"` and `"150."`. The client normalizes them before sending (Task 8).

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:contract`
Expected: FAIL. `/api/debts` returns 404 `not_found`.

- [ ] **Step 3: Implement `Validation.php`, `DebtRepo.php`, `handlers/debts.php` and register the routes**

`GET /api/debts`, `POST /api/debts`, `GET|PUT|DELETE /api/debts/{id}`. Query params are validated with `ctype_digit` before casting. `create` and `update` re-read the row with `find` so timestamps come from the DB.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run assemble && npm run test:contract`
Expected: PASS (all of `ping`, `debts`, `validation`)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: debts CRUD API with shared validation rules"
```

---

### Task 3: Summary, app-level cache, token guard, Spec update

**Files:**
- Create: `apache/src/AppCache.php`, `apache/src/Guard.php`, `apache/src/handlers/summary.php`
- Modify: `apache/src/DebtRepo.php` (add `summary()`), `apache/src/routes.php`, `apache/src/handlers/debts.php` (wire `on_debts_changed`)
- Test: `tests/contract/summary.test.js`, `tests/contract/guard.test.js`

**Interfaces:**
- Consumes: Task 1 core, Task 2 `DebtRepo`, `on_debts_changed()`.
- Produces:
  - `DebtRepo::summary(): array`. Returns `{total_unpaid: "12345.00", count_unpaid, count_paid, count_all, count_friends_unpaid, generated_at}`. `count_friends_unpaid` is `COUNT(DISTINCT friend_name) WHERE is_paid = 0`, a field added to the Spec (decided).
  - `AppCache::__construct(string $dir)`, `AppCache::summary(callable $compute): array{0: array, 1: 'HIT'|'MISS'}`. It uses `summary.json` with a 10 s TTL based on the file mtime.
  - `AppCache::invalidate(): void` (unlinks `summary.json`), `AppCache::stats(): array{hits:int, misses:int}` (reads `stats.json`), `AppCache::clear(): void` (removes both files)
  - `require_test_token(): void`. Throws `HttpError(403,'forbidden')` when the header is missing, the configured token is shorter than 24 characters, or the `hash_equals` check fails.
- Writes are atomic: write `*.tmp.<pid>`, then `rename`. `CACHE_DIR` is created with mode 0700 if missing. Stats updates are best-effort under `flock`, because the Spec says the counts are approximate.

- [ ] **Step 1: Write the failing tests**

```js
test('summary shape and X-App-Cache MISS→HIT→MISS after create', async () => {
  await api('DELETE', '/api/cache', { headers: { 'X-Test-Token': TOKEN } });  // 204
  const a = await api('GET', '/api/summary'); assert.equal(a.headers.get('x-app-cache'), 'MISS');
  const b = await api('GET', '/api/summary'); assert.equal(b.headers.get('x-app-cache'), 'HIT');
  const c = await api('POST', '/api/debts', { json: { friend_name: 'z', amount: '10' } });
  const d = await api('GET', '/api/summary'); assert.equal(d.headers.get('x-app-cache'), 'MISS');
  assert.equal(d.json.count_all, a.json.count_all + 1);
  assert.match(d.json.total_unpaid, /^\d+\.\d\d$/);
  for (const k of ['count_unpaid','count_paid','count_all','count_friends_unpaid']) assert.equal(typeof d.json[k], 'number');
  await api('DELETE', `/api/debts/${c.json.id}`);
});
test('summary expires after 10 s', { timeout: 15000 }, async () => { /* MISS, HIT, sleep 11000, MISS */ });
test('two unpaid rows for the same friend count once in count_friends_unpaid', ...);
test('cache-stats returns {hits, misses} numbers; DELETE /api/cache resets them to 0', ...);
```

`guard.test.js`: `DELETE /api/cache` without a token → 403 `{error:'forbidden'}`; with a wrong token → 403; with the correct token → 204.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run assemble && npm run test:contract`
Expected: FAIL. `/api/summary` returns 404.

- [ ] **Step 3: Implement `AppCache`, `Guard`, `summary()`, routes `GET /api/summary`, `GET /api/cache-stats`, `DELETE /api/cache`, and wire `on_debts_changed()` → `AppCache::invalidate()`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run assemble && npm run test:contract`
Expected: PASS

- [ ] **Step 5: Update the Spec doc.** In Claude Doc `3b70e9a5-d40d-4820-9823-f9b1afac65da`, use the Docs `update` tool to add these three items under §5:
  - `count_friends_unpaid` in the `/api/summary` example
  - the validation-message table from Task 2
  - the `utf8mb4` table options note under §3

If the executor has no Docs tool, append the same text to `design-handoff/SPEC-CHANGES.md` and flag it in the task report.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: summary with app-level file cache and test-token guard"
```

---

### Task 4: Caching endpoints `/cache/*`

**Files:**
- Create: `apache/src/handlers/cache.php`
- Modify: `apache/src/routes.php`
- Test: `tests/contract/cache.test.js`

**Interfaces:**
- Consumes: Task 1 core.
- Produces the routes `GET /cache/static`, `GET /cache/none`, `GET /cache/time`, `GET /cache/gzip`. None of them are under `/api`, so `X-Stack` and `Server-Timing` are optional; send them anyway via `Http::commonHeaders()` for consistency.

Pinned values: the static body is a constant ≈2 KB ASCII `text/plain; charset=utf-8` string, built deterministically (for example the line `Tabby cache test line NNN\n` repeated). Its ETag is `'"' . sha1(body) . '"'`. `Last-Modified` is a fixed date, `Wed, 21 Oct 2026 00:00:00 GMT`. The gzip body is exactly 204,800 bytes of compressible text.

- [ ] **Step 1: Write the failing tests**

- `/cache/static` → 200, `cache-control === 'public, max-age=60'`, the ETag is quoted, `last-modified` is present, and the body length is between 1900 and 2200
- With `If-None-Match: <etag>` → 304 and an empty body
- `/cache/none` → same body, and `cache-control === 'no-store'`
- `/cache/time` → `cache-control === 'public, max-age=10'`, `server_time` ends in `Z`, `unix_ms` is a number, and two calls 50 ms apart give different `unix_ms` (no app cache locally)
- `/cache/gzip` fetched with `Accept-Encoding: identity` → `content-length === '204800'` and no `content-encoding`

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run assemble && npm run test:contract`
Expected: FAIL (404 on `/cache/static`)

- [ ] **Step 3: Implement `handlers/cache.php`** (compare `If-None-Match` after splitting on commas and trimming, and treat `W/` weak matches as equal)

- [ ] **Step 4: Run the tests to verify they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: /cache/* endpoints for browser, proxy and compression checks"
```

---

### Task 5: Test API — slow, echo, seed, limited

**Files:**
- Create: `apache/src/RateLimiter.php`, `apache/src/handlers/testapi.php`
- Modify: `apache/src/DebtRepo.php` (`seed`, `deleteSeed`), `apache/src/routes.php`
- Test: `tests/contract/testapi.test.js`

**Interfaces:**
- Consumes: `require_test_token()`, `on_debts_changed()`, `DebtRepo`.
- Produces:
  - `DebtRepo::seed(int $n, bool $reset): int`. It runs in one transaction with multi-row prepared inserts in chunks of 500. Names are random from a fixed 20-name Thai list in `DebtRepo::SEED_NAMES`. Amounts are `random_int(1,500) * 10`. `is_paid` is 1 with probability 0.3. `note` is `'[seed]'`.
  - `DebtRepo::deleteSeed(): int` (`DELETE FROM debts WHERE note = '[seed]'`)
  - `RateLimiter::hit(PDO $pdo, string $ip, int $limit = 10, ?int $now = null): array{allowed: bool, remaining: int, retry_after: int}`. Window is the UTC minute floor. It upserts with `INSERT … ON DUPLICATE KEY UPDATE hits = hits + 1`, then reads `hits`. `retry_after = 60 - ($now % 60)`. It also deletes rows older than 1 hour with probability 1/100.

Route behavior:
- `GET /api/slow?ms=` takes an integer 0–10000, otherwise 400 `bad_params`. It needs a token, uses `usleep`, and returns `{"slept_ms": n}`.
- `GET|POST|PUT|DELETE /api/echo` returns `{method, path, query, protocol, client_ip, headers, body_size, body_preview}`. `protocol` is `https` if `$_SERVER['HTTPS']` is non-empty and not `off`, else `http`. `client_ip` is `REMOTE_ADDR`. `headers` contains only the whitelisted ones that are present. The body is read from `php://input`; more than 1,048,576 bytes → 413 `payload_too_large`. `body_preview` is the first 1024 bytes, made valid UTF-8 with `mb_scrub`.
- `POST /api/seed?n=&reset=` takes n 1–10000, otherwise 400. It needs a token and returns `{inserted, duration_ms}`. `DELETE /api/seed` needs a token and returns `{deleted}`.
- `GET /api/limited` always sends `X-RateLimit-Limit: 10` and `X-RateLimit-Remaining`. When the limit is exceeded it returns 429 `{error:'rate_limited', retry_after}` with a matching `Retry-After`. Otherwise it returns 200 `{"ok": true}`.

- [ ] **Step 1: Write the failing tests**

- slow: no token → 403; `ms=50` → 200 `{slept_ms:50}`, elapsed ≥ 50 ms; `ms=10001` and `ms=-1` → 400
- echo: PUT with a JSON body echoes `method==='PUT'` and `body_size` correctly; `Authorization` and `Cookie` are never present in `headers`; a body of 1,048,577 bytes → 413
- seed: `n=0` → 400; `n=50&reset=1` → `inserted===50`; the summary `count_all` rises by 50; `DELETE /api/seed` → `deleted===50`
- limited: first `TRUNCATE rate_limits` through `scripts/db-reset.mjs --truncate rate_limits` (add that flag). If the current second is past 45, wait for the next minute. Then 10 calls → 200 with `X-RateLimit-Remaining` going 9…0, and the 11th → 429 with `Retry-After === String(json.retry_after)`.

- [ ] **Step 2: Run them to verify they fail**

Expected: FAIL (404)

- [ ] **Step 3: Implement `RateLimiter`, the seed functions, and `handlers/testapi.php`**

- [ ] **Step 4: Run the tests to verify they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: slow, echo, seed and rate-limited test endpoints"
```

---

### Task 6: Bandwidth — `/download/{mb}`, `/upload`

**Files:**
- Create: `apache/src/handlers/bandwidth.php`
- Modify: `apache/src/routes.php`
- Test: `tests/contract/bandwidth.test.js`

**Interfaces:**
- Consumes: `require_test_token()`, `Http::*`.
- Produces:
  - `GET /download/{mb}` (mb ∈ {1, 10, 100}, else 400 `bad_params`) sends these headers: `Content-Type: application/octet-stream`, `Content-Length: mb*1048576`, `Cache-Control: no-store`, `X-Accel-Buffering: no`, and no `Content-Encoding`. Before streaming it calls `ini_set('zlib.output_compression','0')`, clears every `ob_*` buffer, and calls `set_time_limit(0)`. It then streams `random_bytes(65536)` per chunk with `flush()`.
  - `POST /upload` returns `{received_bytes, duration_ms}`.
    - Missing `file` → 400 `bad_params`.
    - `UPLOAD_ERR_INI_SIZE`, `UPLOAD_ERR_FORM_SIZE`, or `CONTENT_LENGTH > post_max_size` (when `$_FILES` and `$_POST` come back empty) → 413 `payload_too_large`.
    - A size over 104,857,600 → 413.
    - The temp file is never moved.

- [ ] **Step 1: Write the failing tests**

- Both endpoints without a token → 403. `/download/2` → 400.
- `/download/1` with a token → 200, the body byte length is exactly 1048576, `content-length` is `1048576`, and there is no `content-encoding`. The first 64 KB has more than 200 distinct byte values as an entropy check.
- `/upload` with a 1 MB `FormData` blob → `received_bytes` within 1% of 1048576.
- `/upload` with no `file` field → 400.

- [ ] **Step 2: Run them to verify they fail**

Expected: FAIL (404)

- [ ] **Step 3: Implement `handlers/bandwidth.php`**

- [ ] **Step 4: Run the tests to verify they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: streaming download and discard-only upload endpoints"
```

---

### Task 7: Web-server routing — `.htaccess`, Nginx snippet, robots, Laragon run

**Files:**
- Create: `apache/public/.htaccess`, `nginx/nginx-snippet.conf`, `shared/public/robots.txt`, `docs/LOCAL-DEV.md`
- Test: the existing contract suite, run against Laragon Apache

**Interfaces:**
- Consumes: the full PHP app (Tasks 1–6) and `scripts/assemble.mjs`.
- Produces the routing contract every PHP host must honor: `/` → `index.html`, `/test` → `test.html`, existing files served directly, and everything else → `index.php` with the query string kept.

- [ ] **Step 1: Write `.htaccess`**: `DirectoryIndex index.html`; `RewriteEngine On`; `RewriteRule ^test$ test.html [L]`; `RewriteCond %{REQUEST_FILENAME} !-f`; `RewriteCond %{REQUEST_FILENAME} !-d`; `RewriteRule ^ index.php [QSA,L]`; `<IfModule mod_headers.c> Header set X-Robots-Tag "noindex" </IfModule>`; `Options -Indexes`. Do not add deflate or expires rules, because the host's own behavior is the thing under test.

- [ ] **Step 2: Write `nginx-snippet.conf`**:
  - `location = /test { try_files /test.html =404; }`
  - `location / { try_files $uri $uri/ /index.php?$query_string; }`
  - a PHP-FPM `location ~ \.php$` block with a placeholder socket
  - `add_header X-Robots-Tag noindex always;`
  - commented lines `client_max_body_size 110m;` and `fastcgi_read_timeout 15s;`, each with a note to record the value the host actually uses (Spec §9)

- [ ] **Step 3: Write `robots.txt`** (`User-agent: *` / `Disallow: /`). Write `docs/LOCAL-DEV.md`, which covers the Laragon PATH setup, `npm run db:reset`, `npm run serve`, and the Laragon Apache vhost: create a junction `C:\laragon\www\tabby` → `<repo>\dist\php`; Laragon then serves `dist\php\public` at `http://tabby.test`.

- [ ] **Step 4: Run the contract suite through Laragon Apache**

Run: `npm run assemble && BASE_URL=http://tabby.test npm run test:contract`
Expected: PASS. Then also check:
- `curl -sI http://tabby.test/test` → 200 `text/html`
- `curl -sI http://tabby.test/robots.txt` → 200
- `curl -s -X PUT http://tabby.test/api/debts/999999 -d '{}'` → 404 JSON. This proves PUT is not blocked.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Apache/Nginx routing, robots.txt and local dev guide"
```

---

### Task 8: Front-end pure modules

**Files:**
- Create: `shared/public/static/js/lib/money.js`, `dates.js`, `avatar.js`, `pager.js`, `stats.js`, `api.js`
- Test: `tests/unit/money.test.js`, `dates.test.js`, `avatar.test.js`, `pager.test.js`, `stats.test.js`, `api.test.js`

**Interfaces (all named ES exports; Tasks 10–13 import these exact names):**
- `money.js`
  - `formatBaht(amount: string): string`. `"12345.00"` → `"฿12,345"`, `"150.50"` → `"฿150.50"`. Grouping uses `Intl.NumberFormat('th-TH')`, applied to the integer part parsed from the string.
  - `parseAmountInput(raw: string): {ok: true, value: string} | {ok: false}`. It trims, removes `,`, accepts `^\d*\.?\d{0,2}$` with at least one digit, and returns `value` as a 2-decimal string. `"150."` → `"150.00"`, `".5"` → `"0.50"`. It rejects `"0"`, `"0.00"`, negatives, more than 2 decimals, `"1e3"`, values above 99999999.99, and the empty string.
  - `addBaht(raw: string, baht: number): string` works in integer satang. An unparsable or empty `raw` counts as 0. The result has no decimals when whole (`"150"` + 100 → `"250"`) and 2 decimals otherwise (`"150.5"` + 50 → `"200.50"`).
- `dates.js`
  - `groupLabel(iso: string, now: Date): string`, computed in Asia/Bangkok. It returns:
    - `วันนี้` for the same day
    - `สัปดาห์นี้` for the same Monday-start week
    - `เดือนนี้` for the same calendar month (decided: DESIGN has no label for "earlier this month")
    - `เดือนที่แล้ว` for the previous calendar month
    - otherwise the month name and BE year, for example `กันยายน 2569`
  - `formatShortDate(iso: string): string` → `"20 ต.ค. 2569"`
- `avatar.js`
  - `initialOf(name: string): string`. It skips leading `เ แ โ ใ ไ` and returns the first remaining character. `แพรว` → `พ`, `โอ๊ต` → `อ`, `เอิร์ธ` → `อ`, `ต้น` → `ต`, `"🐱cat"` → `🐱` (code-point aware). The user decided this on 2026-10-21; the board's "โ" for โอ๊ต contradicts its own แพรว → พ.
  - `avatarVariant(name: string): 'a'|'b'|'c'|'d'` uses djb2 over UTF-16 code units, `>>> 0`, `% 4`, mapped to a–d. It is deterministic.
- `pager.js`
  - `lastPage(total, perPage): number` (minimum 1)
  - `pageItems(current: number, last: number): Array<number|'…'>`. It shows 1, current ± 1, and last, with `…` for any gap: (5, 10) → `[1,'…',4,5,6,'…',10]` and (1, 3) → `[1,2,3]`.
  - `rangeText(page, perPage, total): string` → `"แสดง 1–10 จาก 10 รายการ (หน้าละ 20)"`
  - `mobilePageText(page, last): string` → `"หน้า 1 จาก 3"`
- `stats.js`
  - `percentile95(sortedMs: number[]): number` returns `sorted[ceil(0.95*N)-1]`.
  - `median(nums: number[]): number` takes the mean of the two middle values when N is even.
  - `summarize(samples: Array<{ms: number, status: number, serverMs: number|null}>, wallMs: number)` returns `{ok, errorsByStatus: {[status: string]: number}, errRate, avg, median, p95, min, max, rps, serverAvg}`. `ok` counts 2xx, a network error is status `0`, `rps = N / (wallMs/1000)`, and `serverAvg` is `null` when no sample has `serverMs`.
  - `histogram(ms: number[], bins: number)` returns `{counts: number[], upper: number, labels: [string, string, string]}`. `upper = max(100, ceil(p95/50)*50)`. The bins split `[0, upper)` equally and the last bin also takes everything ≥ its lower edge. Labels are `["0", String(upper/2), `${upper}+`]`.
  - `histogramSummary(h): string` → `"กราฟแท่งการกระจายเวลาตอบสนอง ส่วนใหญ่อยู่ที่ {lo} ถึง {hi} มิลลิวินาที"` for the tallest bin, or `"กราฟแท่งการกระจายเวลาตอบสนอง ส่วนใหญ่อยู่ที่ {upper} มิลลิวินาทีขึ้นไป"` when that is the last bin. The prefix matches the boards' `aria-label`.
  - `mbps(bytes, ms): number` = `bytes*8/(ms/1000)/1e6`, rounded to 1 decimal.
- `api.js`
  - `needsToken(method: string, path: string): boolean` follows the token list in Global Constraints.
  - `createApi({ fetchImpl = fetch, getToken = () => '' })` returns `{ request(method, path, {json, body, signal} = {}) }`. A 2xx response resolves to `{status, data, headers}` (`data` is `null` on 204). A non-2xx response or a network failure rejects with `ApiError`.
  - `class ApiError extends Error { kind: 'validation'|'rate_limited'|'forbidden'|'not_found'|'too_large'|'bad_request'|'network'|'server'; status: number; fields?: Record<string,string>; retryAfter?: number }`
  - It sends `X-Test-Token` only when `needsToken` is true and a token exists, uses `credentials: 'same-origin'`, and never logs the token.

- [ ] **Step 1: Write the failing unit tests.** Cover every example value listed above. Add these explicit cases:
  - Review Focus 2: `parseAmountInput` on each of `" 150 "`, `"1,000"`, `"150."`, `".5"`, `"0.001"`, `"99999999.99"`, `"100000000"`, `"-5"`, `"1e3"`, `""`
  - `groupLabel` across a week that straddles a month boundary, using `now = 2026-10-01T02:00:00Z`, a Thursday in Bangkok: Monday 2026-09-28 → `สัปดาห์นี้`
  - a UTC time that is already the next day in Bangkok: `2026-10-20T18:30:00Z` with `now = 2026-10-21T03:00:00Z` → `วันนี้`
  - `percentile95` with N=20 → index 18, and N=1 → the only value
  - `needsToken('DELETE','/api/cache') === true`, `needsToken('GET','/api/cache-stats') === false`, `needsToken('GET','/api/slow?ms=200') === true`
  - `createApi` with a stub `fetchImpl` returning 422 → rejects with `kind === 'validation'` and `fields` from the body; 429 → `retryAfter` from the body

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. The modules cannot be found.

- [ ] **Step 3: Implement the six modules.** They must not use DOM APIs at import time, so they stay importable in Node.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: front-end pure modules for money, dates, avatar, paging, stats, api"
```

---

### Task 9: CSS, fonts, HTML shells, e2e harness

**Files:**
- Create: `shared/public/static/css/style.css`, `shared/public/index.html`, `shared/public/test.html`, `shared/public/static/fonts/*.woff2` + `OFL.txt`, `scripts/copy-fonts.mjs`
- Create: `playwright.config.js`, `tests/e2e/helpers.js`, `tests/e2e/shell.spec.js`
- Modify: `package.json` (devDependencies `@playwright/test`, `@fontsource/noto-sans-thai`, `@fontsource/prompt`)

**Interfaces:**
- Consumes: the tokens file and DESIGN §2–4. Task 7 serves `/` and `/test`.
- Produces:
  - Stable DOM mount points that Tasks 10–13 fill:
    - `index.html`: `<html lang="th">` with the viewport meta from DESIGN §3. `<nav class="sidebar on-dark" aria-label="เมนูหลัก">` is the desktop nav; per the boards its wordmark is a `<p>`, and the desktop `<h1>` is "รายการหนี้". `<header class="topbar">` is the mobile header: `<h1>` wordmark "Tabby" plus the gear link `href="/test" aria-label="ทดสอบระบบ"` (G2). The gear also shows in the empty state, which is the only way to reach `/test` on mobile even though the Empty board has no icon. The desktop summary is `<section aria-label="สรุป">`; on mobile it is `aria-label="ยอดค้างรวม"`. `<main id="main" tabindex="-1">`, `<div id="view-list">`, `<div id="view-form" hidden>`, `<div id="dialog-root">`, `<div id="toast-root">`, and `<script type="module" src="/static/js/app.js">`
    - `test.html`: the same shell with `<main id="main">`, `<script type="module" src="/static/js/test.js">`, and the sidebar link "ทดสอบระบบ" marked `aria-current="page"`
  - CSS class names (BEM) for every component in DESIGN §4.1–4.18:
    - `.summary`, `.summary__label`, `.summary__value`, `.summary__sub`, `.summary-cards`
    - `.seg`, `.seg__btn`, `.debt-group`, `.debt-list`, `.debt`, `.debt__main`, `.debt__text`, `.debt__name`, `.debt__note`, `.debt__amount`, `.debt.is-paid`, `.debt.is-highlight`
    - `.avatar`, `.avatar--a`…`.avatar--d`, `.check-btn`, `.toast`, `.toast__action`, `.fab`
    - `.sheet`, `.modal`, `.scrim`, `.field`, `.field__label`, `.field__input`, `.field__input--amount`, `.field__error`, `.field.is-invalid`
    - `.chips`, `.chip`, `.empty`, `.tool-card`, `.meter`, `.progress`, `.checks`, `.badge--ok|--fail|--note|--busy`, `.stats`, `.histogram`
    - `.table-wrap`, `.debts-table`, `.pill--unpaid|--paid`, `.pager`, `.pager__page`, `.btn`, `.btn--primary|--secondary|--danger|--text`, `.skeleton`, `.sr-only`
  - `tests/e2e/helpers.js`: `resetDb()` (calls `scripts/db-reset.mjs --truncate debts`), `createDebt(request, body)`, `MOBILE = {width: 390, height: 844}`, `NARROW = {width: 360, height: 740}`, `DESKTOP = {width: 1280, height: 800}`.

- [ ] **Step 1: Install devDependencies and write `scripts/copy-fonts.mjs`.** It copies the Thai+Latin subset woff2 files from `node_modules/@fontsource/{noto-sans-thai,prompt}/files/`: Noto Sans Thai 400/500/600 and Prompt 500/600. They go to `shared/public/static/fonts/` with the license as `OFL.txt`. Commit the font files so deploys do not need npm.

- [ ] **Step 2: Write the failing e2e `shell.spec.js`**

```js
for (const vp of [NARROW, DESKTOP]) test(`no horizontal scroll at ${vp.width}`, async ({ page }) => {
  await page.setViewportSize(vp); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('no cross-origin requests', async ({ page }) => { /* collect page.on('request') URLs for / and /test; every origin === baseURL origin */ });
test('fonts are self-hosted and load', async ({ page }) => { /* await document.fonts.ready; document.fonts.check('600 16px Prompt') === true */ });
test('sidebar only ≥900px, topbar only <900px', ...);
test('no element has a style attribute in served HTML', ...);   // fetch /, /test raw text; assert !/ style="/.test(html)
test('/test sidebar link has aria-current=page', ...);
```

`playwright.config.js` sets `baseURL` from `BASE_URL` (default `http://127.0.0.1:8080`), `webServer: { command: 'npm run serve', url: 'http://127.0.0.1:8080/api/ping', reuseExistingServer: true }`, `workers: 1` (one shared DB), and Chromium only.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright install chromium && npm run test:e2e -- shell`
Expected: FAIL. `index.html` is missing, so `/` returns 404.

- [ ] **Step 4: Write `style.css`.** In this order:
  1. the `tokens/tabby.css` content verbatim
  2. `@font-face` blocks (`font-display: swap`, `/static/fonts/…`)
  3. layout: mobile first, then `@media (min-width: 900px)` per DESIGN §3, with `main` `max-width: 1200px` and the mobile column `max-width: 640px` centered
  4. every component in §4 with the exact sizes, radii, and colors given there
  5. `.skeleton` (`--chip` blocks)
  6. the `prefers-reduced-motion` rule

Then write the two HTML shells. The sidebar wordmark is "Tabby" and its links are "รายการหนี้" and "ทดสอบระบบ".

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:e2e -- shell`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: style.css with tokens and components, HTML shells, self-hosted fonts"
```

---

### Task 10: List view `/` — summary, filter, list/table, pagination, states

**Files:**
- Create: `shared/public/static/js/app.js`, `shared/public/static/js/ui/dom.js`, `shared/public/static/js/ui/list.js`
- Test: `tests/e2e/list.spec.js`

**Interfaces:**
- Consumes: all of Task 8's modules, Task 9's mount points and classes.
- Produces (Tasks 11–12 rely on these):
  - `ui/dom.js`: `h(tag, attrs = {}, ...children): Element`. String children become text nodes, and `attrs` supports `class`, `data-*`, `aria-*`, `hidden`, and `on<Event>` handlers. Also `svgIcon(name: 'check'|'plus'|'back'|'close'|'gear'): SVGElement`.
  - `app.js` holds the state store `state = { filter: 'all'|'unpaid'|'paid', page, total, rows, summary, loading, error, highlightId }`. It exports `loadList(): Promise<void>`, `loadSummary(): Promise<void>`, `render(): void`, and `isDesktop(): boolean` (`matchMedia('(min-width: 900px)')`, re-rendering on change).
  - It also exports the hash router: `route(): void` handles `#/` or an empty hash as the list, `#/new`, and `#/edit/{id}`. On every view change it focuses that view's `<h1 tabindex="-1">`.
  - Desktop list state syncs to the query string `?paid=0|1&page=N` with `history.replaceState`. On load the state is read from it, defaulting to filter `all` and page 1.
  - `ui/list.js`: `renderList(state, {onToggle, onDelete}): Element` (mobile groups) and `renderTable(state, {onToggle, onDelete}): Element` (desktop).

Behavior per DESIGN §4.1–4.4, 4.10, 4.16, 4.17, 5.1, 5.4, 5.6:
- Counts in the filter labels come from the summary: `count_all`, `count_unpaid`, `count_paid`.
- Mobile summary sub-line: `เพื่อน {count_friends_unpaid} คน ยังไม่จ่าย {count_unpaid} รายการ`, or `ยังไม่มีใครติดเงิน` when `count_unpaid` is 0.
- The desktop cards show `{n} คน` and `{n} รายการ`.
- The empty state appears only when `count_all === 0`, and then the filter and FAB are hidden. A filter that returns no rows shows `ไม่มีรายการยังไม่จ่าย` or `ไม่มีรายการจ่ายแล้ว` with a link button `ดูทั้งหมด`.
- Load error: `โหลดรายการไม่สำเร็จ` with a `ลองใหม่` button. On 429 the message is `ส่งคำขอถี่เกินไป รอ {retry_after} วินาที`. A summary error shows `—` and does not block the list.
- Skeleton: 5 rows on mobile, 8 on desktop, and `aria-busy="true"` on `<main>` while loading.
- Test hooks: the DESIGN §5.1 `data-testid` list.

- [ ] **Step 1: Write the failing e2e `list.spec.js`.** Every test starts with `resetDb()` and creates its rows through `request.post('/api/debts')`. Cases:
  - empty DB → `สมุดยังว่างอยู่` is visible, `[data-testid=summary-total]` reads `฿0`, and there is no `.seg` or `fab-add`
  - 3 rows (2 unpaid) → summary sub-line `เพื่อน 2 คน ยังไม่จ่าย 2 รายการ` when the names differ; the filter buttons read `ทั้งหมด 3`, `ยังไม่จ่าย 2`, `จ่ายแล้ว 1`; the default `aria-pressed=true` is on `filter-all`
  - clicking `filter-paid` → only paid rows; the mobile paid row has class `is-paid`
  - XSS: create `friend_name: '<img src=x onerror="window.__x=1">'`. The name renders as literal text and `window.__x` is undefined.
  - grouping: a row created now sits under an `<h2>` reading `วันนี้`
  - avatar: `แพรว` shows `พ`
  - pagination: 25 rows (via `POST /api/seed?n=25&reset=1` with the token) → mobile `หน้า 1 จาก 2`, and `pager-next` shows page 2 with 5 rows. Desktop `rangeText` reads `แสดง 1–20 จาก 25 รายการ (หน้าละ 20)`, the current page button has `aria-current=page`, and on page 1 "ก่อนหน้า" has `aria-disabled=true` and is not focusable.
  - desktop table date column matches `/^\d{1,2} \S+ 25\d\d$/`, and the table has no sort arrows
  - load error: route `/api/debts*` → 500 → `โหลดรายการไม่สำเร็จ` is visible, and clicking `ลองใหม่` after removing the route renders the rows

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- list`
Expected: FAIL. `app.js` is missing, so nothing renders.

- [ ] **Step 3: Implement `ui/dom.js`, `ui/list.js`, and the list part of `app.js`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:e2e -- list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: debt list view with summary, filter, table, pagination and states"
```

---

### Task 11: Add/edit form (mobile view + desktop modal)

**Files:**
- Create: `shared/public/static/js/ui/form.js`, `shared/public/static/js/ui/dialog.js`
- Modify: `shared/public/static/js/app.js` (routes `#/new` and `#/edit/{id}`)
- Test: `tests/e2e/form.spec.js`

**Interfaces:**
- Consumes: `h`, `svgIcon`, the router, `state`, `loadList`, `loadSummary`, `createApi`, `parseAmountInput`, `addBaht`.
- Produces:
  - `ui/dialog.js`: `openDialog(el: HTMLElement, {kind: 'sheet'|'modal', initialFocus: HTMLElement, onClose: () => void}): {close(): void}`. It renders a scrim (a click on it closes), sets `role=dialog` and `aria-modal=true`, traps Tab, closes on Esc, marks the rest of the page `inert`, and on close restores focus to the opener. Task 12 reuses it.
  - `ui/form.js`: `renderForm({mode: 'new'|'edit', debt?: Debt, friendNames: string[], desktop: boolean, onSubmit, onCancel, onDelete}): HTMLElement`
  - `app.js` exports `showToast({text, actionLabel?, onAction?}): void`. It is a single instance with `role=status` and a 5000 ms auto-close that pauses on hover or focus, and a new toast replaces the old one. It is built here because the save success path needs it; Task 12 adds undo usage.

Behavior per DESIGN §4.8, 4.9, 4.18, 5.2, 5.7:
- Titles: `เพิ่มรายการ` / `แก้ไขรายการ`.
- Labels: `ใครยืม`, `จำนวนเงิน (บาท)`, and `โน้ต` + `(ไม่ใส่ก็ได้)`. Placeholders: `0` and `เช่น ค่าข้าวเที่ยง`.
- Buttons: `บันทึก`, which shows `กำลังบันทึก…` while busy; `ยกเลิก`; and, in edit mode only, `ลบรายการนี้`.
- Name chips (mobile only) take the 4 most recent unique names from `state.rows` and the row is hidden if there are none. Amount chips `+50 +100 +500 +1000` call `addBaht`. A name chip moves focus to the amount field.
- Client errors are `กรอกชื่อเพื่อน` and `กรอกจำนวนเงินเป็นตัวเลข เช่น 150`. A 422 maps `fields.*` under the matching field. After an error, focus goes to the first invalid field.
- The submit payload is `{friend_name: trimmed, amount: parseAmountInput(...).value, note: trimmed || null, is_paid}`. `is_paid` is 0 for new rows; edit mode keeps the existing value.
- On success:
  - Set `location.hash = '#/'` (or close the modal) and reset filter `all`, page 1.
  - Highlight the new or edited row with `.is-highlight` for 1.5 s.
  - Toast `เพิ่มรายการของ{ชื่อ}แล้ว` after an add. After an edit, show no toast.
- Edit deep link (Review Focus 3): when the id is not in `state.rows`, fetch `GET /api/debts/{id}`. On 404, `location.replace('#/')` and reload the list without showing an error.
- Mobile: a full view with the back link `aria-label="กลับไปรายการหนี้"` and the FAB hidden. Desktop: `openDialog(kind:'modal')`, with the first focus on "ใครยืม" and no chips.
- Test hooks: `input-friend`, `input-amount`, `input-note`, `error-friend|amount|note`, `btn-save`, `btn-cancel`.

- [ ] **Step 1: Write the failing e2e `form.spec.js`**
  - Mobile F1: FAB → `#/new` with focus on the h1. Tap amount chip `+100` twice → `200`. Enter the name `ต้น` and save. Back on `#/`, the row is first, `.is-highlight` is set, and the toast reads `เพิ่มรายการของต้นแล้ว`.
  - Saving an empty form → `กรอกชื่อเพื่อน` under the name field, `aria-invalid=true`, `aria-describedby` points to the error id, and the name field has focus.
  - Amount `abc` → `กรอกจำนวนเงินเป็นตัวเลข เช่น 150`.
  - Server 422: route POST to return `{error:'validation_failed', fields:{amount:'ต้องมากกว่า 0'}}` → that text appears under the amount field.
  - Edit: tap a row → `#/edit/{id}` with fields prefilled. Change the note and save → the list shows the new note, and `is_paid` is unchanged (verify via `GET /api/debts/{id}`).
  - Review Focus 3: `goto('/#/edit/999999')` → ends on `#/` with the list rendered and no uncaught errors (`page.on('pageerror')` stays empty). `goto('/#/edit/{id}')` for an existing id not on the current page → the form is prefilled.
  - Browser back from `#/new` → `#/`.
  - Desktop: "เพิ่มรายการ" opens a modal titled `เพิ่มรายการ` with focus on `input-friend` and no `.chip`. Esc closes it and focus returns to the button. A scrim click closes it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- form`
Expected: FAIL (no `#/new` view)

- [ ] **Step 3: Implement `ui/dialog.js`, `ui/form.js`, `showToast`, and the form routes**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:e2e -- form list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add/edit form view and desktop modal with validation and 422 mapping"
```

---

### Task 12: Toggle paid + undo, delete confirm dialog

**Files:**
- Create: `shared/public/static/js/ui/confirm.js`
- Modify: `shared/public/static/js/app.js`, `shared/public/static/js/ui/list.js`
- Test: `tests/e2e/actions.spec.js`

**Interfaces:**
- Consumes: `openDialog`, `showToast`, `state`, `loadList`, `loadSummary`, `createApi`, `formatBaht`.
- Produces:
  - `toggleDebt(debt: Debt): Promise<void>`. It applies an optimistic flip and sends `PUT` with all fields and `is_paid` flipped. On success it shows the toast `{ชื่อ} จ่ายแล้ว {ยอด}` with action `เลิกทำ` when the row became paid. The undo sends a PUT that restores the original `is_paid` for the debt captured in **that** toast's closure, then closes the toast. On failure it rolls back and shows the toast `ทำรายการไม่สำเร็จ ลองอีกครั้ง` with action `ลองใหม่`. On 429 the text is `ส่งคำขอถี่เกินไป รอ {retry_after} วินาที`. While busy the button has `aria-busy=true` and is disabled.
  - `ui/confirm.js`: `confirmDelete(debt: Debt, {desktop: boolean}): Promise<boolean>` uses `openDialog` as a sheet on mobile and a 400px modal on desktop, with first focus on `ยกเลิก`.
  - `deleteDebt(debt: Debt): Promise<void>` sends `DELETE` and shows `กำลังลบ…` while busy. On 204 or 404 it closes, returns to `#/` when coming from the edit view, and reloads. If the current page is now empty and `page > 1`, it sets `page -= 1` and reloads. On 204 it shows the toast `ลบรายการของ{ชื่อ}แล้ว` without undo.

Copy per DESIGN §4.4, 4.5, 4.7, 4.16:
- Check button `aria-label`: `ทำเครื่องหมายว่า {ชื่อ} จ่ายแล้ว` / `ยกเลิกการจ่ายของ {ชื่อ}`.
- Desktop row buttons: `จ่ายแล้ว` or `ยกเลิกจ่าย`, `แก้ไข`, `ลบ`, each with an `aria-label` that includes the name, for example `ลบรายการของแพรว`.
- Sheet title: `ลบรายการของ{ชื่อ}?`. Body: `{note} {ยอด} จะหายไปจากสมุด และกู้คืนไม่ได้`, or `ยอด {ยอด} จะหายไปจากสมุด และกู้คืนไม่ได้` when there is no note.
- Sheet buttons: `ลบรายการ` and `ยกเลิก`. The target row gets `.is-highlight` while the dialog is open.
- Test hooks: `check-btn`, `toast`, `toast-undo`, `dialog-delete`, `dialog-delete-confirm`, `dialog-delete-cancel`.

- [ ] **Step 1: Write the failing e2e `actions.spec.js`**
  - F2: tap `check-btn` → `aria-pressed=true` immediately. The toast reads `ต้น จ่ายแล้ว ฿180` (using the real row amount; G8). The summary `ยังไม่จ่าย` count drops by 1. `toast-undo` → the row is back to unpaid (checked via the API) and the toast closes.
  - The unpaid filter hides a row after it is toggled.
  - Review Focus 4a: route `PUT /api/debts/*` → 500. After a tap, `aria-pressed` returns to `false` and the toast reads `ทำรายการไม่สำเร็จ ลองอีกครั้ง`.
  - Review Focus 4b: toggle row A, then row B, then press `toast-undo`. Only B is reverted and A stays paid.
  - The toast auto-closes after 5 s (`page.clock` fast-forward).
  - Mobile F3: open row → `ลบรายการนี้` → the sheet has `role=dialog` and focus on `dialog-delete-cancel`. Esc closes it. Reopen, then `dialog-delete-confirm` → back on `#/`, the row is gone, and the toast reads `ลบรายการของ{ชื่อ}แล้ว`.
  - Desktop F3: the row's `ลบ` → a centered modal. Confirm → the row is gone and `document.activeElement` is the list `<h1>` (focus never lands on a removed node).
  - Review Focus 5: seed 21 rows, go to page 2 (1 row), and delete it → page 1 is shown with 20 rows.
  - A delete that returns 404: route DELETE → 404 → the dialog closes and the list reloads with no error toast.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- actions`
Expected: FAIL

- [ ] **Step 3: Implement `toggleDebt`, `confirm.js`, `deleteDebt`, and wire the row buttons**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:e2e`
Expected: PASS (shell, list, form, actions)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: mark-paid with undo toast and delete confirmation dialogs"
```

---

### Task 13: `/test` page — token, bandwidth, caching checks, load test

**Files:**
- Create: `shared/public/static/js/test.js`, `shared/public/static/js/tools/bandwidth.js`, `shared/public/static/js/tools/caching.js`, `shared/public/static/js/tools/loadtest.js`
- Modify: `shared/public/test.html` (static card skeletons: headings, labels, buttons)
- Test: `tests/e2e/testpage.spec.js`, `tests/unit/caching.test.js`

**Interfaces:**
- Consumes: `createApi`, `needsToken`, `summarize`, `histogram`, `histogramSummary`, `mbps`, `median` from Task 8, and `h` from Task 10.
- Produces:
  - `tools/bandwidth.js`: `runDownload(mb, {token, onProgress}): Promise<{mbps, ttfbMs, totalMs}>` streams with a `ReadableStream` reader and counts bytes. `runUpload(mb, …)` sends `crypto.getRandomValues`-filled blob chunks (65,536 bytes per call) as `FormData('file')`, and its progress follows the run count. `runParallel5({token}): Promise<{mbps}>` runs 5 × `/download/10`.
  - `tools/caching.js`: `CHECKS: Array<{key, label}>` lists the rows in Spec §7 order: `etag` ETag, `cache-control` Cache-Control, `conditional` ส่งซ้ำด้วย If-None-Match, `no-store` no-store (/cache/none), `server-cache` แคชฝั่ง server (/cache/time), `gzip` บีบอัด (/cache/gzip), `app-cache` App cache (/api/summary), `static` ไฟล์ static (CSS/JS). This is 8 rows: DESIGN splits the Spec's check 1 into ETag and Cache-Control rows. The aria summary counts all rows, so it reads "ผ่าน n จาก 8 ข้อ". Also exports `runChecks({fetchImpl, token, onRow}): Promise<Array<{key, result: 'pass'|'fail'|'note', detail: string}>>`.
  - `tools/loadtest.js`: `ENDPOINTS` holds the 6 Spec targets. `clampInputs(reqs, conc): {reqs, conc, errors: {reqs?: 'สูงสุด 1,000', conc?: 'สูงสุด 50'}}`. `runLoad({path, reqs, conc, token, onProgress}): Promise<Stats & {histogram}>` reads `Server-Timing` `app;dur=` from each response.

Pinned check logic (unit-tested with a stub `fetchImpl`):
- `etag` passes when the `/cache/static` response has an ETag. Detail: `พบ {etag} ในคำตอบ` (board format), then a second line `เปิด /cache/static ซ้ำใน DevTools` as a link with `target=_blank rel=noopener`. On failure the detail is `ไม่พบ ETag`.
- `cache-control` passes when `/cache/static` has `Cache-Control` containing `max-age`. Detail is the received value, for example `public, max-age=60`.
- `conditional` passes on 304 with detail `ได้ 304 Not Modified`. Any other status fails with detail `ได้ {status}`.
- `no-store` passes when `Cache-Control` contains `no-store`.
- `server-cache` is always `note`. Detail `มี cache` when two `unix_ms` values 0–1 s apart are equal, else `ไม่มี cache`.
- `gzip` passes when `Content-Encoding` is gzip or br. With `fetch` the transferred size is only an estimate (from `PerformanceResourceTiming.encodedBodySize < 51200`), so the detail must say it is an estimate. Fetch `/cache/gzip?t=<now>` to dodge the browser cache.
- `app-cache` needs the sequence DELETE /api/cache (token) → summary MISS → HIT → POST temp row → summary MISS → DELETE temp row. A missing token is `fail` with detail `ใส่รหัสทดสอบก่อน`. The 11-second wait from the Spec is skipped in the UI. The note under `ตรวจใหม่` says the run writes and deletes 1 temp row.
- `static` passes when `/static/js/app.js` and `/static/css/style.css` each have an ETag or Last-Modified. Detail is the received `Cache-Control`, or `ไม่มี Expires หรือ max-age`.

UI per DESIGN §4.11–4.15, 5.5, 5.8:
- Token card `รหัสทดสอบ`: `type=password`, label `X-Test-Token`, helper `ใช้กับ download, upload, slow, seed และล้างแคช เก็บไว้ในหน้านี้เท่านั้น ปิดหน้าแล้วหาย`. The value lives only in a module variable, never in storage. Errors read `ใส่รหัสทดสอบก่อน`, and a 403 shows the same text.
- Bandwidth: select `ขนาดไฟล์ดาวน์โหลด` with 1/10/100 MB, default 10. Buttons `เริ่มดาวน์โหลด`, `ทดสอบอัปโหลด`, `5 พร้อมกัน`. Each run does 3 rounds and shows `รอบที่ n/3`, keeps `—` until the first round finishes, then shows the median Mbps plus TTFB and total time tiles. The number layout follows the boards. On mobile it is one big number with the unit `Mbps ดาวน์โหลด`, plus the sub-line `อัปโหลดล่าสุด {n} Mbps` once an upload has run. On desktop there are two columns, `ดาวน์โหลด` | `อัปโหลด`, each a 44px number with an inline `Mbps` unit. A 413 shows `ขนาดใหญ่สุดที่ผ่าน: n MB`.
- Caching: `ตรวจใหม่` and `ล้างแคชแอป`, plus the hit/miss counts from `/api/cache-stats`. Badges `ผ่าน`, `ไม่ผ่าน`, `บันทึก`, `กำลังตรวจ…`.
- API Request: an endpoint select, `จำนวนคำขอ` (default 100), `ส่งพร้อมกัน` (default 10), and `เริ่มทดสอบ`, which shows `กำลังทดสอบ… (n/N)` while running.
- Results: 8 stat tiles (`เฉลี่ย`, `มัธยฐาน`, `p95`, `อัตราผิดพลาด`, `สำเร็จ`, `สูงสุด`, `req/วินาที`, `Server-Timing เฉลี่ย`), an error list like `429 × 12`, and the histogram. The histogram has 8 bars on mobile and 10 on desktop, `--danger-bar` on the last 2, `role=img`, the `histogramSummary` text, and a `.sr-only` table.
- Test hooks: the DESIGN §5.5 list.

- [ ] **Step 1: Write the failing tests**
  - `tests/unit/caching.test.js` stubs `fetchImpl` so each check returns `pass`, `fail`, and `note` exactly as defined above. It also asserts `clampInputs(5000, 80)` → `{reqs: 1000, conc: 50, errors: {reqs: 'สูงสุด 1,000', conc: 'สูงสุด 50'}}`.
  - `tests/e2e/testpage.spec.js`:
    - Pressing `bw-start-dl` without a token → `ใส่รหัสทดสอบก่อน`.
    - With the token, `bw-size=1` → `bw-speed` becomes numeric and `bw-progress` has `aria-valuenow=100`.
    - `cache-run` → 8 `cache-row-*` rows each end with a badge other than `กำลังตรวจ…`, and the live summary matches `/^ผ่าน \d+ จาก 8 ข้อ$/`.
    - Load test on `/api/ping` with 20 requests and 5 concurrent → `api-stat-ok` reads `20` and `api-histogram` has an `aria-label` starting `กราฟแท่งการกระจายเวลาตอบสนอง ส่วนใหญ่อยู่ที่`.
    - The token is absent from `localStorage`, `sessionStorage`, and `document.cookie` after use.
    - No horizontal scroll at 360px on `/test`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit && npm run test:e2e -- testpage`
Expected: FAIL

- [ ] **Step 3: Implement the three tool modules, `test.js`, and the static parts of `test.html`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:e2e -- testpage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: /test page with bandwidth, caching checks and load test"
```

---

### Task 14: Acceptance pass (DESIGN §9 checklist) on Laragon Apache

**Files:**
- Create: `tests/e2e/a11y.spec.js`
- Modify: any file a failing check points to

**Interfaces:**
- Consumes: the whole app.

- [ ] **Step 1: Write `a11y.spec.js`**
  - Every visible `button`, `a`, `[role=button]`, `input`, and `select` on `/` (mobile and desktop) and on `/test` has a bounding box ≥ 44×44. Text links inside paragraphs are excluded.
  - Every `input` and `select` has an associated `<label for>`.
  - There is no emoji in the served HTML or JS text (`/\p{Extended_Pictographic}/u`).
  - The page works at 200% zoom: viewport 640×400 at `deviceScaleFactor: 2` with no horizontal scroll.
  - A keyboard-only F1 run passes: Tab to the FAB, Enter, type the fields, Enter on `บันทึก`.
  - `prefers-reduced-motion: reduce` → `getComputedStyle(.toast).transitionDuration === '0s'`.
  - No board sample data (`ต้น`, `แพรว`, `฿12,345`, `48.2`) appears in the served JS or HTML. `SEED_NAMES` lives in PHP, not in `shared/`.

- [ ] **Step 2: Run the full suite through Laragon Apache**

Run: `npm run assemble && npm run test:unit && BASE_URL=http://tabby.test npm run test:contract && BASE_URL=http://tabby.test npm run test:e2e`
Expected: PASS. If something fails, fix it in the owning file and rerun. Then check by hand:
- `curl -sI http://tabby.test/static/js/app.js` shows `ETag` or `Last-Modified` (record the `Cache-Control`)
- the DevTools Network tab shows no request to `fonts.googleapis.com`
- `sha1sum` over `shared/public/**` matches `dist/php/public/` (the static files are byte-identical)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: acceptance checks for a11y, targets, zoom and sample-data leaks"
```
