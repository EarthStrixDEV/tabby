<?php
declare(strict_types=1);

/** Reads a key from config.php (sits next to src/ both in the repo and in dist/php). */
function cfg(string $key): string
{
    static $config = null;
    $config ??= require __DIR__ . '/../config.php';
    return (string) $config[$key];
}

final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $dsn = 'mysql:host=' . cfg('DB_HOST') . ';dbname=' . cfg('DB_NAME') . ';charset=utf8mb4';
            self::$pdo = new PDO($dsn, cfg('DB_USER'), cfg('DB_PASS'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            self::$pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo;
    }
}
