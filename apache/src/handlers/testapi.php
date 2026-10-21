<?php
declare(strict_types=1);

const ECHO_MAX_BODY = 1048576;

/** Parses a non-negative integer query value within [min, max]; anything else is a 400. */
function testapi_int_param(string $key, int $min, int $max): int
{
    $raw = Http::query($key);
    if ($raw === null || !ctype_digit($raw) || strlen($raw) > 6 || (int) $raw < $min || (int) $raw > $max) {
        throw new HttpError(400, 'bad_params');
    }
    return (int) $raw;
}

function handle_slow(array $params): void
{
    require_test_token();
    $ms = testapi_int_param('ms', 0, 10000);
    // Holds the worker for the whole delay on purpose: that is what the endpoint measures.
    usleep($ms * 1000);
    Http::json(200, ['slept_ms' => $ms]);
}

function handle_echo(array $params): void
{
    $declared = $_SERVER['CONTENT_LENGTH'] ?? null;
    if (is_string($declared) && ctype_digit($declared) && (int) $declared > ECHO_MAX_BODY) {
        throw new HttpError(413, 'payload_too_large');
    }
    // Chunked bodies carry no Content-Length, so the read itself is capped one byte past the limit.
    $in = fopen('php://input', 'rb');
    $body = $in === false ? '' : (string) stream_get_contents($in, ECHO_MAX_BODY + 1);
    if (strlen($body) > ECHO_MAX_BODY) {
        throw new HttpError(413, 'payload_too_large');
    }

    // Whitelist only: Authorization and Cookie must never be reflected.
    $sources = [
        'Host' => ['HTTP_HOST'],
        'User-Agent' => ['HTTP_USER_AGENT'],
        'X-Forwarded-For' => ['HTTP_X_FORWARDED_FOR'],
        'X-Forwarded-Proto' => ['HTTP_X_FORWARDED_PROTO'],
        'X-Real-IP' => ['HTTP_X_REAL_IP'],
        'Content-Type' => ['CONTENT_TYPE', 'HTTP_CONTENT_TYPE'],
        'Content-Length' => ['CONTENT_LENGTH', 'HTTP_CONTENT_LENGTH'],
    ];
    $headers = [];
    foreach ($sources as $name => $keys) {
        foreach ($keys as $key) {
            if (isset($_SERVER[$key]) && is_string($_SERVER[$key]) && $_SERVER[$key] !== '') {
                $headers[$name] = $_SERVER[$key];
                break;
            }
        }
    }

    $https = $_SERVER['HTTPS'] ?? '';
    Http::json(200, [
        'method' => $_SERVER['REQUEST_METHOD'],
        'path' => (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH),
        'query' => (string) ($_SERVER['QUERY_STRING'] ?? ''),
        'protocol' => ($https !== '' && strtolower((string) $https) !== 'off') ? 'https' : 'http',
        'client_ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        'headers' => (object) $headers,
        'body_size' => strlen($body),
        'body_preview' => mb_scrub(substr($body, 0, 1024), 'UTF-8'),
    ]);
}

function handle_seed_create(array $params): void
{
    require_test_token();
    $n = testapi_int_param('n', 1, 10000);
    $reset = Http::query('reset') === '1';
    $t = hrtime(true);
    $inserted = DebtRepo::seed($n, $reset);
    on_debts_changed();
    Http::json(200, ['inserted' => $inserted, 'duration_ms' => (int) round((hrtime(true) - $t) / 1e6)]);
}

function handle_seed_delete(array $params): void
{
    require_test_token();
    $deleted = DebtRepo::deleteSeed();
    on_debts_changed();
    Http::json(200, ['deleted' => $deleted]);
}

function handle_limited(array $params): void
{
    $limit = 10;
    $r = RateLimiter::hit(Db::pdo(), (string) ($_SERVER['REMOTE_ADDR'] ?? ''), $limit);
    $headers = [
        'X-RateLimit-Limit' => (string) $limit,
        'X-RateLimit-Remaining' => (string) $r['remaining'],
    ];
    if (!$r['allowed']) {
        Http::json(429, ['error' => 'rate_limited', 'retry_after' => $r['retry_after']],
            $headers + ['Retry-After' => (string) $r['retry_after']]);
        return;
    }
    Http::json(200, ['ok' => true], $headers);
}
