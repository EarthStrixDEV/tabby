<?php
declare(strict_types=1);

/**
 * Validates a debt payload (full replacement semantics, used by POST and PUT).
 *
 * @return array{0: ?array{friend_name: string, amount: string, note: ?string, is_paid: int}, 1: array<string, string>}
 *         [clean, errors]; clean is null when errors is non-empty.
 */
function validate_debt(mixed $input): array
{
    $input = is_array($input) ? $input : [];
    $errors = [];

    $name = $input['friend_name'] ?? null;
    $name = is_string($name) ? trim($name) : '';
    if ($name === '') {
        $errors['friend_name'] = 'ห้ามว่าง';
    } elseif (mb_strlen($name, 'UTF-8') > 100) {
        $errors['friend_name'] = 'ยาวเกิน 100 ตัวอักษร';
    }

    [$amount, $amountError] = validate_amount($input['amount'] ?? null);
    if ($amountError !== null) {
        $errors['amount'] = $amountError;
    }

    $note = $input['note'] ?? null;
    if ($note !== null) {
        if (!is_string($note)) {
            $errors['note'] = 'ต้องเป็นข้อความ';
            $note = null;
        } else {
            $note = trim($note);
            if (mb_strlen($note, 'UTF-8') > 255) {
                $errors['note'] = 'ยาวเกิน 255 ตัวอักษร';
            }
            $note = $note === '' ? null : $note;
        }
    }

    $isPaid = 0;
    if (array_key_exists('is_paid', $input)) {
        $v = $input['is_paid'];
        if ($v === 0 || $v === 1 || $v === false || $v === true) {
            $isPaid = (int) $v;
        } else {
            $errors['is_paid'] = 'ต้องเป็น 0 หรือ 1';
        }
    }

    if ($errors) {
        return [null, $errors];
    }
    return [['friend_name' => $name, 'amount' => (string) $amount, 'note' => $note, 'is_paid' => $isPaid], []];
}

/**
 * Amounts are compared as digit strings, never as floats.
 *
 * @return array{0: ?string, 1: ?string} [normalized "150.00", error message]
 */
function validate_amount(mixed $raw): array
{
    if (is_int($raw)) {
        $s = (string) $raw;
    } elseif (is_float($raw)) {
        // json_encode emits the shortest round-trip form (1.001, not 1.0009999999999999); INF yields false.
        $encoded = json_encode($raw);
        if ($encoded === false) {
            return [null, 'ต้องเป็นตัวเลข'];
        }
        $s = $encoded;
    } elseif (is_string($raw)) {
        $s = trim($raw);
    } else {
        return [null, 'ต้องเป็นตัวเลข'];
    }
    if (!preg_match('/^(-?)(\d+)(?:\.(\d+))?$/D', $s, $m)) {
        return [null, 'ต้องเป็นตัวเลข'];
    }
    $negative = $m[1] === '-';
    $int = ltrim($m[2], '0');
    $frac = $m[3] ?? '';

    if ($negative || ($int === '' && trim($frac, '0') === '')) {
        return [null, 'ต้องมากกว่า 0'];
    }
    if (strlen($frac) > 2) {
        return [null, 'ทศนิยมไม่เกิน 2 ตำแหน่ง'];
    }
    if (strlen($int) > 8) {
        return [null, 'ต้องไม่เกิน 99,999,999.99'];
    }
    return [($int === '' ? '0' : $int) . '.' . str_pad($frac, 2, '0'), null];
}
