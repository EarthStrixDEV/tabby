<?php
declare(strict_types=1);

final class HttpError extends Exception
{
    public function __construct(
        public int $status,
        public string $errorCode,
        public array $extra = [],
        public array $headers = []
    ) {
        parent::__construct($errorCode);
    }
}

final class Http
{
    public static function commonHeaders(): void
    {
        $ms = number_format((hrtime(true) - TABBY_T0) / 1e6, 1, '.', '');
        header('X-Stack: ' . cfg('APP_STACK'));
        header('X-Robots-Tag: noindex');
        header('Server-Timing: app;dur=' . $ms);
    }

    public static function json(int $status, ?array $body, array $headers = []): void
    {
        http_response_code($status);
        foreach ($headers as $name => $value) {
            header($name . ': ' . $value);
        }
        self::commonHeaders();
        if ($body === null || $status === 204) {
            return;
        }
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** Decodes the request body as a JSON object (not a list or scalar). */
    public static function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw === false ? '' : $raw, true);
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw new HttpError(400, 'invalid_json');
        }
        return $data;
    }

    public static function query(string $key): ?string
    {
        $v = $_GET[$key] ?? null;
        return is_string($v) ? $v : null;
    }
}
