<?php
declare(strict_types=1);

/**
 * File-based cache for /api/summary plus approximate hit/miss counters.
 * CACHE_DIR may be wiped by a rebuild, so it is created lazily with mode 0700.
 */
final class AppCache
{
    private const TTL_SECONDS = 10;

    public function __construct(private string $dir)
    {
    }

    /**
     * @param callable():array $compute
     * @return array{0: array, 1: 'HIT'|'MISS'}
     */
    public function summary(callable $compute): array
    {
        $file = $this->path('summary.json');
        clearstatcache(true, $file);
        $mtime = @filemtime($file);
        if ($mtime !== false && time() - $mtime < self::TTL_SECONDS) {
            $raw = @file_get_contents($file);
            $data = $raw === false ? null : json_decode($raw, true);
            if (is_array($data)) {
                $this->bump('hits');
                return [$data, 'HIT'];
            }
        }

        $data = $compute();
        $this->writeAtomic($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $this->bump('misses');
        return [$data, 'MISS'];
    }

    public function invalidate(): void
    {
        @unlink($this->path('summary.json'));
    }

    /** @return array{hits: int, misses: int} */
    public function stats(): array
    {
        $raw = @file_get_contents($this->path('stats.json'));
        $data = $raw === false ? null : json_decode($raw, true);
        return [
            'hits' => is_array($data) ? max(0, (int) ($data['hits'] ?? 0)) : 0,
            'misses' => is_array($data) ? max(0, (int) ($data['misses'] ?? 0)) : 0,
        ];
    }

    public function clear(): void
    {
        @unlink($this->path('summary.json'));
        @unlink($this->path('stats.json'));
    }

    private function path(string $name): string
    {
        return rtrim($this->dir, '/\\') . DIRECTORY_SEPARATOR . $name;
    }

    private function ensureDir(): bool
    {
        return is_dir($this->dir) || @mkdir($this->dir, 0700, true) || is_dir($this->dir);
    }

    /** Best effort: a cache that cannot be written must not break the request. */
    private function writeAtomic(string $file, string $contents): void
    {
        if (!$this->ensureDir()) {
            return;
        }
        $tmp = $file . '.tmp.' . getmypid();
        if (@file_put_contents($tmp, $contents) === false) {
            @unlink($tmp);
            return;
        }
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
        }
    }

    /** Counters are approximate by spec; flock only narrows the race, failures are ignored. */
    private function bump(string $key): void
    {
        if (!$this->ensureDir()) {
            return;
        }
        $fh = @fopen($this->path('stats.json'), 'c+');
        if ($fh === false) {
            return;
        }
        try {
            if (!flock($fh, LOCK_EX)) {
                return;
            }
            $data = json_decode((string) stream_get_contents($fh), true);
            $hits = is_array($data) ? max(0, (int) ($data['hits'] ?? 0)) : 0;
            $misses = is_array($data) ? max(0, (int) ($data['misses'] ?? 0)) : 0;
            $$key++;
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode(['hits' => $hits, 'misses' => $misses]));
            fflush($fh);
            flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
    }
}

function app_cache(): AppCache
{
    return new AppCache(cfg('CACHE_DIR'));
}
