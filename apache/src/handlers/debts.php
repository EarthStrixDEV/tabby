<?php
declare(strict_types=1);

function handle_debts_list(array $params): void
{
    $pageRaw = Http::query('page');
    $page = 1;
    if ($pageRaw !== null) {
        if (!ctype_digit($pageRaw) || ltrim($pageRaw, '0') === '') {
            throw new HttpError(400, 'bad_params');
        }
        // Clamp absurd values: the result is an empty page either way, and the offset must not overflow.
        $page = strlen($pageRaw) > 9 ? 1_000_000_000 : (int) $pageRaw;
    }
    $perPageRaw = Http::query('per_page');
    $perPage = 20;
    if ($perPageRaw !== null) {
        if (!ctype_digit($perPageRaw) || strlen($perPageRaw) > 3 || (int) $perPageRaw < 1 || (int) $perPageRaw > 100) {
            throw new HttpError(400, 'bad_params');
        }
        $perPage = (int) $perPageRaw;
    }
    $paidRaw = Http::query('paid');
    if ($paidRaw !== null && $paidRaw !== '0' && $paidRaw !== '1') {
        throw new HttpError(400, 'bad_params');
    }
    $paid = $paidRaw === null ? null : (int) $paidRaw;

    $result = DebtRepo::list($page, $perPage, $paid);
    Http::json(200, [
        'data' => $result['data'],
        'page' => $page,
        'per_page' => $perPage,
        'total' => $result['total'],
    ]);
}

/** @return array validated clean payload; throws 400/422 */
function debts_clean_body(): array
{
    [$clean, $errors] = validate_debt(Http::jsonBody());
    if ($clean === null) {
        throw new HttpError(422, 'validation_failed', ['fields' => $errors]);
    }
    return $clean;
}

function handle_debts_create(array $params): void
{
    $row = DebtRepo::create(debts_clean_body());
    on_debts_changed();
    Http::json(201, $row);
}

function handle_debts_get(array $params): void
{
    $row = DebtRepo::find((int) $params['id']);
    if ($row === null) {
        throw new HttpError(404, 'not_found');
    }
    Http::json(200, $row);
}

function handle_debts_update(array $params): void
{
    $row = DebtRepo::update((int) $params['id'], debts_clean_body());
    if ($row === null) {
        throw new HttpError(404, 'not_found');
    }
    on_debts_changed();
    Http::json(200, $row);
}

function handle_debts_delete(array $params): void
{
    if (!DebtRepo::delete((int) $params['id'])) {
        throw new HttpError(404, 'not_found');
    }
    on_debts_changed();
    Http::json(204, null);
}
