<?php
declare(strict_types=1);

final class Router
{
    /** @var array<int, array{string, string, callable}> [method, regex, handler] */
    private static array $routes = [];

    public static function add(string $method, string $pattern, callable $handler): void
    {
        $regex = preg_replace_callback('/\{(id|mb)\}/', static fn(array $m): string =>
            $m[1] === 'id' ? '(?P<id>[1-9][0-9]*)' : '(?P<mb>[0-9]+)', $pattern);
        self::$routes[] = [$method, '#^' . $regex . '$#', $handler];
    }

    public static function dispatch(string $method, string $path): void
    {
        $allowed = [];
        foreach (self::$routes as [$m, $regex, $handler]) {
            if (!preg_match($regex, $path, $match)) {
                continue;
            }
            if ($m === $method) {
                $params = array_filter($match, 'is_string', ARRAY_FILTER_USE_KEY);
                $handler($params);
                return;
            }
            $allowed[] = $m;
        }
        if ($allowed) {
            throw new HttpError(405, 'method_not_allowed', [], ['Allow' => implode(', ', array_unique($allowed))]);
        }
        throw new HttpError(404, 'not_found');
    }
}
