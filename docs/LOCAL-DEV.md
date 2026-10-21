# Local development

## Prerequisites

PHP and MySQL ship with Laragon but are not on `PATH` by default. In Git Bash, per shell session:

```bash
export PATH="/c/laragon/bin/php/php-8.5.11-Win32-vs17-x64:/c/laragon/bin/mysql/mysql-8.4.3-winx64/bin:$PATH"
```

(Or add both directories to the Windows user `PATH` permanently.) Laragon's MySQL must be running (user `root`, empty password, `127.0.0.1`).

Copy `apache/config.sample.php` to `apache/config.php` and fill it in. `config.php` is gitignored; never commit it. For the test suites to pass, use exactly these values (`CACHE_DIR` must be an absolute path to this repo's `dist/cache`):

```php
<?php
return [
    'DB_HOST'    => '127.0.0.1',
    'DB_NAME'    => 'tb_local',
    'DB_USER'    => 'root',
    'DB_PASS'    => '',
    'APP_STACK'  => 'apache',
    'CACHE_DIR'  => 'D:/path/to/tabby/dist/cache',   // absolute path to <repo>/dist/cache
    'TEST_TOKEN' => 'local-test-token-0123456789abcdef',
];
```

The tests send `TEST_TOKEN` as `X-Test-Token`. You can override it for the test runner with the `TEST_TOKEN` environment variable, but then it must match the value in `config.php`.

## Database

```bash
npm run db:reset      # drops and recreates tb_local from shared/schema.sql
```

## Run the app

| Command | Server | URL |
| --- | --- | --- |
| `npm run serve` | PHP built-in server (`php -S`) | `http://127.0.0.1:8080` |
| `npm run serve:apache` | Real Apache (Laragon's httpd), foreground | `http://127.0.0.1:8081` |

Both run `npm run assemble` first, which builds `dist/php`. Re-run it (or restart the server) after editing PHP.

`serve:apache` generates `dist/apache/httpd.conf` and starts Laragon's httpd with it. It does not touch Laragon's own config, vhosts or the hosts file, so it can run next to Laragon's Apache on port 80. Stop it with Ctrl+C. Overrides: `HTTPD_BIN` (path to `httpd.exe`) and `PHP_DIR` (PHP install directory).

Use `serve:apache` when you need to test `.htaccess` routing, since `php -S` uses `index.php` as its router and ignores `.htaccess`.

## Tests

Point the suites at a running server with `BASE_URL` (default is the `php -S` server):

```bash
npm run test:contract                                      # against :8080
BASE_URL=http://127.0.0.1:8081 npm run test:contract       # against real Apache
BASE_URL=http://127.0.0.1:8081 npm run test:e2e            # Playwright
npm run test:unit
```

`tests/contract/testapi.test.js` has local-only assumptions: it expects `client_ip` to be `127.0.0.1` and truncates the `rate_limits` table through the local `mysql` client (`scripts/db-reset.mjs --truncate`). It therefore needs a local database and cannot run against a remote host.

## Production routing

Production hosts do their own routing; nothing here is used there:

- Apache: `apache/public/.htaccess`
- Nginx: `nginx/nginx-snippet.conf` (include in the `server` block; set the PHP-FPM socket and record the host's `client_max_body_size` and `fastcgi_read_timeout`)

Both implement the same contract: `/` serves `index.html`, `/test` serves `test.html`, existing files are served directly, and everything else goes to `index.php` with the query string kept.
