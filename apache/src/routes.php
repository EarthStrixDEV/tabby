<?php
declare(strict_types=1);

require __DIR__ . '/Validation.php';
require __DIR__ . '/DebtRepo.php';
require __DIR__ . '/handlers/ping.php';
require __DIR__ . '/handlers/debts.php';
require __DIR__ . '/handlers/summary.php';

Router::add('GET', '/api/ping', 'handle_ping');
Router::add('GET', '/api/debts', 'handle_debts_list');
Router::add('POST', '/api/debts', 'handle_debts_create');
Router::add('GET', '/api/debts/{id}', 'handle_debts_get');
Router::add('PUT', '/api/debts/{id}', 'handle_debts_update');
Router::add('DELETE', '/api/debts/{id}', 'handle_debts_delete');
Router::add('GET', '/api/summary', 'handle_summary');
Router::add('GET', '/api/cache-stats', 'handle_cache_stats');
Router::add('DELETE', '/api/cache', 'handle_cache_clear');
