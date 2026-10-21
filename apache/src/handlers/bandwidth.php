<?php
declare(strict_types=1);

const BANDWIDTH_CHUNK = 65536;
const BANDWIDTH_MB = 1048576;
const UPLOAD_MAX_BYTES = 104857600;

/** Converts a php.ini size shorthand such as "2G", "128M" or "512K" to bytes. */
function bandwidth_ini_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '') {
        return 0;
    }
    $n = (int) $value;
    switch (strtoupper($value[strlen($value) - 1])) {
        case 'G':
            return $n * 1073741824;
        case 'M':
            return $n * 1048576;
        case 'K':
            return $n * 1024;
        default:
            return $n;
    }
}

function handle_download(array $params): void
{
    require_test_token();
    $mb = (int) $params['mb'];
    if (!in_array($mb, [1, 10, 100], true)) {
        throw new HttpError(400, 'bad_params');
    }

    // The bytes must reach the wire untouched and unbuffered: no PHP compression, no output buffers.
    ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (function_exists('set_time_limit')) {
        @set_time_limit(0); // may be listed in disable_functions on shared hosts
    }

    Http::commonHeaders();
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . ($mb * BANDWIDTH_MB));
    header('Cache-Control: no-store');
    header('X-Accel-Buffering: no');

    $chunks = $mb * BANDWIDTH_MB / BANDWIDTH_CHUNK;
    for ($i = 0; $i < $chunks; $i++) {
        // Random bytes do not compress, so a gzip layer cannot distort the speed figures.
        echo random_bytes(BANDWIDTH_CHUNK);
        flush();
        if (connection_aborted()) {
            return;
        }
    }
}

function handle_upload(array $params): void
{
    require_test_token();

    // Past post_max_size PHP drops the whole body, leaving $_FILES and $_POST empty.
    $declared = $_SERVER['CONTENT_LENGTH'] ?? '';
    if ($declared !== '' && !$_FILES && !$_POST
        && (int) $declared > bandwidth_ini_bytes((string) ini_get('post_max_size'))) {
        throw new HttpError(413, 'payload_too_large');
    }

    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
        throw new HttpError(400, 'bad_params');
    }
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        throw new HttpError(413, 'payload_too_large');
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new HttpError(400, 'bad_params');
    }

    $size = (int) $file['size'];
    if ($size > UPLOAD_MAX_BYTES) {
        throw new HttpError(413, 'payload_too_large');
    }

    // The temp file is never moved: PHP deletes it when the request ends.
    Http::json(200, [
        'received_bytes' => $size,
        'duration_ms' => (int) round((hrtime(true) - TABBY_T0) / 1e6),
    ]);
}
