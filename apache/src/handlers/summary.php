<?php
declare(strict_types=1);

function handle_summary(array $params): void
{
    [$data, $state] = app_cache()->summary([DebtRepo::class, 'summary']);
    Http::json(200, $data, ['X-App-Cache' => $state]);
}

function handle_cache_stats(array $params): void
{
    Http::json(200, app_cache()->stats());
}

function handle_cache_clear(array $params): void
{
    require_test_token();
    app_cache()->clear();
    Http::json(204, null);
}
