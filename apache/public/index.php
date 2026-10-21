<?php
declare(strict_types=1);

define('TABBY_T0', hrtime(true));

$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// Only for `php -S`; Apache and Nginx do this mapping themselves.
if (PHP_SAPI === 'cli-server') {
    $file = realpath(__DIR__ . $path);
    if ($file !== false && is_file($file) && str_starts_with($file, realpath(__DIR__) . DIRECTORY_SEPARATOR)
        && !str_ends_with($file, '.php')) {
        return false;
    }
    $pages = ['/' => 'index.html', '/test' => 'test.html'];
    if (isset($pages[$path]) && is_file(__DIR__ . '/' . $pages[$path])) {
        header('Content-Type: text/html; charset=utf-8');
        readfile(__DIR__ . '/' . $pages[$path]);
        return;
    }
}

require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/../src/routes.php';

try {
    Router::dispatch($_SERVER['REQUEST_METHOD'], $path);
} catch (HttpError $e) {
    Http::json($e->status, ['error' => $e->errorCode] + $e->extra, $e->headers);
}
