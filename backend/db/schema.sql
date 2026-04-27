CREATE DATABASE IF NOT EXISTS `easy-travel-scheduler`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `easy-travel-scheduler`;

-- *** Stage 1 ***

-- 1. 景點主表 (儲存核心文字資訊)
CREATE TABLE IF NOT EXISTS `destinations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `input_region` VARCHAR(100) NULL,
    `city_name` VARCHAR(100) NULL,
    `place_name` VARCHAR(255) NOT NULL,
    `geo_tags` VARCHAR(255) NULL,                    -- 用於「向上支援」的標籤字串 (存入：日本,北海道,札幌)
    `description` TEXT NULL,
    `address` VARCHAR(255) NULL,
    `google_place_id` VARCHAR(255),             -- google map id 
    `lat` DECIMAL(10, 8),                       -- 緯度
    `lng` DECIMAL(11, 8),                       -- 經度
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 追蹤更新時間
    `source` ENUM('ai','manual') NOT NULL DEFAULT 'ai',
    INDEX idx_city(`city_name`),                  -- 加快搜尋快取速度
    INDEX idx_region (`input_region`),
    FULLTEXT INDEX idx_geo_tags (`geo_tags`) WITH PARSER ngram, -- 全文檢索標籤，支援搜尋「日本」時能抓到資料，針對中文推薦使用 ngram 分詞器
    UNIQUE INDEX idx_unique_google_id (google_place_id) -- 防止重複存入：同一個城市不准有同名景點
) ENGINE=InnoDB;

-- *** Stage 2 ***

CREATE TABLE IF NOT EXISTS `trips` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NULL,
  `edit_token` VARCHAR(64) NULL,
  `cover_url` TEXT NULL,
  `title` VARCHAR(100) NOT NULL,
  `days` INT NOT NULL,
  `start_date` DATE NULL,
  `share_token` VARCHAR(100) UNIQUE NULL,
  `is_public` BOOLEAN NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_trips_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trip_days` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `trip_id` INT NOT NULL,
  `day_index` INT NOT NULL,              -- 1..N
  `date` DATE NULL,                      -- start_date 有填才算出日期
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_trip_day` (`trip_id`, `day_index`),
  CONSTRAINT `fk_trip_days_trip`
    FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `trip_places` (
  `trip_id` INT NOT NULL,
  `destination_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`trip_id`, `destination_id`),
  UNIQUE KEY `uk_trip_destination` (`trip_id`, `destination_id`),
  CONSTRAINT `fk_trip_places_trip`
    FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_trip_places_destination`
    FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `itinerary_items` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `trip_id` INT NOT NULL,
  `day_index` INT NOT NULL,                 -- 1..N
  `destination_id` INT NOT NULL,
  `position` INT NOT NULL,                  -- 當天排序 0..n
  `arrival_time` TIME NULL,
  `departure_time` TIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY `uk_trip_destination_once` (`trip_id`, `destination_id`),
  KEY `idx_trip_day_pos` (`trip_id`, `day_index`, `position`),

  CONSTRAINT `fk_itinerary_trip`
    FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_itinerary_destination`
    FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `itinerary_legs` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `trip_id` INT NOT NULL,
  `day_index` INT NOT NULL,
  `from_item_id` INT NOT NULL,
  `to_item_id` INT NOT NULL,
  `travel_mode` VARCHAR(20) NULL,
  `duration_millis` BIGINT NULL,
  `distance_meters` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY `uk_leg_pair` (`from_item_id`, `to_item_id`),
  KEY `idx_leg_trip_day` (`trip_id`, `day_index`),

  CONSTRAINT `fk_leg_trip`
    FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`)
    ON DELETE CASCADE,

  CONSTRAINT `fk_leg_from_item`
    FOREIGN KEY (`from_item_id`) REFERENCES `itinerary_items`(`id`)
    ON DELETE CASCADE,

  CONSTRAINT `fk_leg_to_item`
    FOREIGN KEY (`to_item_id`) REFERENCES `itinerary_items`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


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

