/**
 * 首頁背景圖批次壓縮腳本
 * ------------------------------------------------------------
 * 用途：將 public/Home-bg/ 內的 .jpg 圖片壓成 .webp
 *   - 寬度上限 1920px（不放大小圖，withoutEnlargement）
 *   - 品質 quality 75（肉眼幾乎看不出差異）
 *
 * 執行方式（在 frontend 目錄下）：
 *   node scripts/compress-home-bg.mjs
 *
 * 設計說明：
 *   背景圖是用 CSS background-image 輪播的「裝飾性」圖片，
 *   不需要 next/image 的響應式功能，因此採「build 前預先壓縮」策略，
 *   壓一次就好、程式碼只需把副檔名 .jpg 改成 .webp。
 */

import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// __dirname 在 ESM 中要自己算出來
const __dirname = dirname(fileURLToPath(import.meta.url));

// 圖片資料夾位置（相對於本腳本：../public/Home-bg）
const IMAGE_DIR = join(__dirname, "..", "public", "Home-bg");

// 壓縮參數
const MAX_WIDTH = 1920; // 寬度上限
const QUALITY = 75; // WebP 品質

/** 把 bytes 轉成人類可讀的 KB / MB 字串 */
function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function main() {
  const files = await readdir(IMAGE_DIR);
  const jpgs = files.filter((f) => /\.jpe?g$/i.test(f)).sort();

  if (jpgs.length === 0) {
    console.log("⚠️  找不到任何 .jpg 圖片，可能已經壓縮過了。");
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;

  console.log(`開始壓縮 ${jpgs.length} 張圖片（quality=${QUALITY}, maxWidth=${MAX_WIDTH}）\n`);

  for (const name of jpgs) {
    const srcPath = join(IMAGE_DIR, name);
    const outName = name.replace(/\.jpe?g$/i, ".webp");
    const outPath = join(IMAGE_DIR, outName);

    const beforeBytes = (await stat(srcPath)).size;

    // sharp 處理鏈：resize（限寬、不放大）→ 轉 webp（指定品質）→ 寫檔
    await sharp(srcPath)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(outPath);

    const afterBytes = (await stat(outPath)).size;

    totalBefore += beforeBytes;
    totalAfter += afterBytes;

    const pct = (((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1);
    console.log(
      `✓ ${name.padEnd(16)} ${humanSize(beforeBytes).padStart(9)} → ${humanSize(afterBytes).padStart(9)}  (-${pct}%)`,
    );
  }

  const totalPct = (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1);
  console.log(
    `\n合計：${humanSize(totalBefore)} → ${humanSize(totalAfter)}  (-${totalPct}%)`,
  );
  console.log("\n完成。請確認 .webp 顯示正常後，再刪除原始 .jpg。");
}

main().catch((err) => {
  console.error("壓縮失敗：", err);
  process.exit(1);
});
