<?php
declare(strict_types=1);

final class RateLimiter
{
    /**
     * Fixed-window counter per IP; the window is the UTC minute.
     * @return array{allowed: bool, remaining: int, retry_after: int}
     */
    public static function hit(PDO $pdo, string $ip, int $limit = 10, ?int $now = null): array
    {
        $now ??= time();
        $window = gmdate('Y-m-d H:i:00', $now);

        $pdo->prepare(
            'INSERT INTO rate_limits (ip, window_start, hits) VALUES (:ip, :w, 1)
             ON DUPLICATE KEY UPDATE hits = hits + 1'
        )->execute([':ip' => $ip, ':w' => $window]);

        $stmt = $pdo->prepare('SELECT hits FROM rate_limits WHERE ip = :ip AND window_start = :w');
        $stmt->execute([':ip' => $ip, ':w' => $window]);
        $hits = (int) $stmt->fetchColumn();

        // Housekeeping on roughly 1% of calls keeps the table small without a cron job.
        if (random_int(1, 100) === 1) {
            $pdo->prepare('DELETE FROM rate_limits WHERE window_start < :cutoff')
                ->execute([':cutoff' => gmdate('Y-m-d H:i:00', $now - 3600)]);
        }

        return [
            'allowed' => $hits <= $limit,
            'remaining' => max(0, $limit - $hits),
            'retry_after' => 60 - ($now % 60),
        ];
    }
}
