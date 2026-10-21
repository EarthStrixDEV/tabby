<?php
declare(strict_types=1);

/** Heavy/destructive test endpoints require X-Test-Token matching TEST_TOKEN (constant-time compare). */
function require_test_token(): void
{
    $given = $_SERVER['HTTP_X_TEST_TOKEN'] ?? null;
    $expected = cfg('TEST_TOKEN');
    // A short or missing configured token disables the endpoint instead of accepting a guessable value.
    if (!is_string($given) || strlen($expected) < 24 || !hash_equals($expected, $given)) {
        throw new HttpError(403, 'forbidden');
    }
}
