<?php
declare(strict_types=1);

require __DIR__ . '/Validation.php';
require __DIR__ . '/DebtRepo.php';
require __DIR__ . '/RateLimiter.php';
require __DIR__ . '/handlers/ping.php';
require __DIR__ . '/handlers/debts.php';
require __DIR__ . '/handlers/summary.php';
require __DIR__ . '/handlers/cache.php';
require __DIR__ . '/handlers/testapi.php';
require __DIR__ . '/handlers/bandwidth.php';

Router::add('GET', '/api/ping', 'handle_ping');
Router::add('GET', '/api/slow', 'handle_slow');
foreach (['GET', 'POST', 'PUT', 'DELETE'] as $method) {
    Router::add($method, '/api/echo', 'handle_echo');
}
Router::add('POST', '/api/seed', 'handle_seed_create');
Router::add('DELETE', '/api/seed', 'handle_seed_delete');
Router::add('GET', '/api/limited', 'handle_limited');
Router::add('GET', '/api/debts', 'handle_debts_list');
Router::add('POST', '/api/debts', 'handle_debts_create');
Router::add('GET', '/api/debts/{id}', 'handle_debts_get');
Router::add('PUT', '/api/debts/{id}', 'handle_debts_update');
Router::add('DELETE', '/api/debts/{id}', 'handle_debts_delete');
Router::add('GET', '/api/summary', 'handle_summary');
Router::add('GET', '/api/cache-stats', 'handle_cache_stats');
Router::add('DELETE', '/api/cache', 'handle_cache_clear');
Router::add('GET', '/cache/static', 'handle_cache_static');
Router::add('GET', '/cache/none', 'handle_cache_none');
Router::add('GET', '/cache/time', 'handle_cache_time');
Router::add('GET', '/cache/gzip', 'handle_cache_gzip');
Router::add('GET', '/download/{mb}', 'handle_download');
Router::add('POST', '/upload', 'handle_upload');
