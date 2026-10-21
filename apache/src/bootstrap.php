<?php
declare(strict_types=1);

require __DIR__ . '/Db.php';
require __DIR__ . '/Http.php';
require __DIR__ . '/Router.php';

ini_set('display_errors', '0');

set_exception_handler(static function (Throwable $e): void {
    error_log((string) $e);
    if (!headers_sent()) {
        try {
            Http::json(500, ['error' => 'server_error']);
        } catch (Throwable) {
            http_response_code(500);
        }
    }
});
