<?php
declare(strict_types=1);

require __DIR__ . '/handlers/ping.php';

Router::add('GET', '/api/ping', 'handle_ping');
