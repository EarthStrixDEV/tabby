<?php
declare(strict_types=1);

/** Called after every create, update, delete and seed. Drops the cached /api/summary. */
function on_debts_changed(): void
{
    app_cache()->invalidate();
}
