<?php
declare(strict_types=1);

const CACHE_STATIC_LAST_MODIFIED = 'Wed, 21 Oct 2026 00:00:00 GMT';

function cache_static_body(): string
{
    $body = '';
    for ($i = 1; $i <= 76; $i++) {
        $body .= sprintf("Tabby cache test line %03d\n", $i);
    }
    return $body;
}

/** True when any entry of If-None-Match equals the ETag, ignoring a W/ weak prefix. */
function cache_etag_matches(string $etag): bool
{
    $header = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    foreach (explode(',', $header) as $candidate) {
        $candidate = trim($candidate);
        if (str_starts_with($candidate, 'W/')) {
            $candidate = substr($candidate, 2);
        }
        if ($candidate === '*' || $candidate === $etag) {
            return true;
        }
    }
    return false;
}

function handle_cache_static(array $params): void
{
    $body = cache_static_body();
    $etag = '"' . sha1($body) . '"';
    Http::commonHeaders();
    header('Cache-Control: public, max-age=60');
    header('ETag: ' . $etag);
    header('Last-Modified: ' . CACHE_STATIC_LAST_MODIFIED);
    if (cache_etag_matches($etag)) {
        http_response_code(304);
        return;
    }
    header('Content-Type: text/plain; charset=utf-8');
    echo $body;
}

function handle_cache_none(array $params): void
{
    Http::commonHeaders();
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo cache_static_body();
}

function handle_cache_time(array $params): void
{
    $ms = (int) floor(microtime(true) * 1000);
    Http::commonHeaders();
    header('Cache-Control: public, max-age=10');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'server_time' => gmdate('Y-m-d\TH:i:s\Z', intdiv($ms, 1000)),
        'unix_ms' => $ms,
    ], JSON_UNESCAPED_SLASHES);
}

function handle_cache_gzip(array $params): void
{
    // The web server, not the app, decides on compression.
    ini_set('zlib.output_compression', '0');
    $line = "Tabby gzip test line: the quick brown fox jumps over the lazy dog.\n";
    $body = substr(str_repeat($line, intdiv(204800, strlen($line)) + 1), 0, 204800);
    Http::commonHeaders();
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Length: 204800');
    echo $body;
}
