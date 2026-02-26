CREATE DATABASE IF NOT EXISTS `easy-travel-scheduler`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `easy-travel-scheduler`;

-- 1. 景點主表 (儲存核心文字資訊)
CREATE TABLE IF NOT EXISTS `destinations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `input_region` VARCHAR(100) NOT NULL,       -- 使用者輸入的搜尋詞，如：北海道
    `city_name` VARCHAR(100) NOT NULL,          -- 搜尋關鍵字，例如：福岡
    `place_name` VARCHAR(255) NOT NULL,         -- 景點名稱，例如：大濠公園
    `geo_tags` VARCHAR(255),                    -- 用於「向上支援」的標籤字串 (存入：日本,北海道,札幌)
    `description` TEXT,                         -- 景點介紹
    `address` VARCHAR(255),                     -- 地址
    `google_place_id` VARCHAR(255),             -- google map id 
    `lat` DECIMAL(10, 8),                       -- 緯度
    `lng` DECIMAL(11, 8),                       -- 經度
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 追蹤更新時間
    INDEX idx_city(`city_name`),                  -- 加快搜尋快取速度
    INDEX idx_region (`input_region`),
    FULLTEXT INDEX idx_geo_tags (`geo_tags`) WITH PARSER ngram, -- 全文檢索標籤，支援搜尋「日本」時能抓到資料，針對中文推薦使用 ngram 分詞器
    UNIQUE INDEX idx_unique_google_id (google_place_id) -- 防止重複存入：同一個城市不准有同名景點
) ENGINE=InnoDB;

-- 2. 照片附屬表 (一對多關聯：一個景點對應多張照片)
CREATE TABLE IF NOT EXISTS `destination_photos` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `destination_id` INT NOT NULL,              -- 關聯到 destinations 表的 id
    `photo_url` TEXT NOT NULL,                  -- 照片網址
    `source_url` TEXT NOT NULL,                  -- 來源網址
    `order_index` INT DEFAULT 0,                -- 圖片顯示順序 (0, 1, 2...)
    FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;




-- 3. 使用者收藏表 (這張表紀錄「誰」收藏了「哪個景點」)
CREATE TABLE IF NOT EXISTS `user_favorites` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL, 
    `destination_id` INT NOT NULL,              -- 直接關聯回快取表，避免重複存文字
    `added_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;



CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` CHAR(64) NOT NULL, -- 前面用 secrets.token_hex(32) 產生 32 bytes 隨機值，hex 後會變成 64 個字元，
  `user_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sessions_session_id` (`session_id`),
  KEY `idx_sessions_user_id` (`user_id`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;