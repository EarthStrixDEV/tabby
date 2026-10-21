<?php
// Copy to config.php (never commit it) and fill in real values.
// In production this file lives outside the docroot.
return [
    'DB_HOST'    => 'localhost',
    'DB_NAME'    => 'your_database',
    'DB_USER'    => 'your_user',
    'DB_PASS'    => 'your_password',
    'APP_STACK'  => 'apache',            // apache | nginx | node | python
    'CACHE_DIR'  => '/path/to/cache',    // writable directory, outside the docroot
    'TEST_TOKEN' => 'change-me-long-random-string',
];
