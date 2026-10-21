<?php
declare(strict_types=1);

function handle_ping(array $params): void
{
    $body = ['pong' => true, 'stack' => cfg('APP_STACK'), 'unix_ms' => (int) floor(microtime(true) * 1000)];
    if (Http::query('db') === '1') {
        $t = hrtime(true);
        Db::pdo()->query('SELECT 1')->fetchColumn();
        $body['db_ms'] = round((hrtime(true) - $t) / 1e6, 1);
    }
    Http::json(200, $body);
}
