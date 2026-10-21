-- Deviation from Spec section 3: both tables declare ENGINE/CHARSET/COLLATE explicitly.
-- The shared-hosting default charset can be latin1, which corrupts Thai text.
CREATE TABLE debts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  friend_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  note VARCHAR(255) NULL,
  is_paid TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_paid_created (is_paid, created_at),
  KEY idx_friend (friend_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  ip VARCHAR(45) NOT NULL,
  window_start DATETIME NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
