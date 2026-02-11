CREATE DATABASE IF NOT EXISTS `final_project`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `final_project`;

-- 1. 景點主表 (儲存核心文字資訊)
CREATE TABLE IF NOT EXISTS `destinations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `city_name` VARCHAR(100) NOT NULL,          -- 搜尋關鍵字，例如：福岡
    `place_name` VARCHAR(255) NOT NULL,         -- 景點名稱，例如：大濠公園
    `description` TEXT,                         -- 景點介紹
    `address` VARCHAR(255),                     -- 地址
    `lat` DECIMAL(10, 8),                       -- 緯度
    `lng` DECIMAL(11, 8),                       -- 經度
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (`city_name`)                         -- 加快搜尋快取速度
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

