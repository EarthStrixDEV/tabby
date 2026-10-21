<?php
declare(strict_types=1);

require __DIR__ . '/Db.php';
require __DIR__ . '/Http.php';
require __DIR__ . '/Router.php';
require __DIR__ . '/AppCache.php';
require __DIR__ . '/Guard.php';
require __DIR__ . '/events.php';

ini_set('display_errors', '0');

set_exception_handler(static function (Throwable $e): void {
    error_log((string) $e);
    if (!headers_sent()) {
        try {
            Http::json(500, ['error' => 'server_error']);
        } catch (Throwable) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Robots-Tag: noindex');
            echo '{"error":"server_error"}';
        }
    }
});
