# 圖片最佳化與快取重構計畫

> **執行狀態（2026-06-05 更新）**
>
> 本文件原為「計畫」，以下記錄實際執行結果與和原計畫的差異。
>
> | 項目 | 計畫 | 實際執行 | 狀態 |
> |---|---|---|---|
> | 壓縮方案 | 推薦方案 A（next/image） | **改採方案 B（手動壓 WebP）** | ✅ 完成 |
> | 原始 jpg | 方案 B 原建議保留作 fallback | **直接刪除，只留 WebP** | ✅ 完成 |
> | 圖片總大小 | 預估 40MB → 3-5MB | **34.07MB → 2.40MB（-93%）** | ✅ 完成 |
> | Nginx Cache-Control | 計畫加上 | 已加入 `nginx/default.conf` 並通過 `nginx -t` | ✅ 完成 |
> | Cloudflare Dashboard | 計畫設定 | 尚未設定 | ⬜ 待辦 |
> | 部署到 EC2 + 線上驗收 | 計畫驗收 | 尚未部署 | ⬜ 待辦 |
>
> **為什麼改用方案 B（重要）**：原計畫假設背景圖是用 `<img>` 標籤，但實際程式碼
> （`frontend/app/components/home/HeroSection.tsx`）是用 **CSS `background-image`**
> 做 11 層淡入淡出輪播。`next/image` 會渲染成 `<img>`，無法直接套用到 CSS 背景，
> 硬改成 `<Image fill>` 要大幅重寫輪播圖層、風險高。背景圖屬「裝飾性」靜態資源，
> 不需要 `next/image` 的響應式功能，因此手動預先壓成 WebP 是最低風險、最合適的做法。
>
> 對應 commit：`f6c9e62 PERF(image): 首頁背景圖壓縮為 WebP 並加上靜態資源快取`

## 背景

Easy Travel Scheduler 首頁載入了 11 張背景圖片，原始檔案總大小接近 40MB。目前圖片放在 Next.js 的 `public/` 資料夾內，由 Next.js 容器直接提供（serve），每次請求都經過完整的 Nginx → Next.js 路徑。

### 目前的問題

1. **圖片過大**：單張圖片最大 6.8MB（Home-bg-9.jpg），使用者每次開首頁都要下載數十 MB
2. **Nginx buffer 警告**：圖片超過 Nginx 的記憶體 buffer 上限，被寫入硬碟暫存檔，增加磁碟 I/O
3. **EC2 頻寬浪費**：每個使用者的圖片請求都要經過 EC2，佔用小型 instance 有限的網路頻寬
4. **沒有有效快取**：Cloudflare 已經架好但可能沒有正確快取靜態資源，導致每次請求都回源

---

## 第一步：圖片壓縮與格式轉換

### 目標

將首頁背景圖片從平均 3-7MB 壓縮到 200-500KB 以內，載入速度提升 10-20 倍。

### 方案 A：使用 Next.js `<Image>` 元件（原推薦，**最終未採用**）

> ⚠️ **未採用原因**：實際程式碼用 CSS `background-image` 做輪播，`next/image`
> 無法直接套用（詳見文件開頭的執行狀態說明）。以下內容保留作為知識參考。

Next.js 內建的 `<Image>` 元件（`next/image`）會自動進行圖片最佳化，包括：格式轉換（自動輸出 WebP/AVIF）、響應式尺寸（根據裝置螢幕給不同大小的圖片）、延遲載入（Lazy Loading，畫面外的圖片不會先載入）。

#### 修改方式

將所有 `<img>` 標籤替換為 Next.js 的 `<Image>` 元件：

```jsx
// ===== 修改前 =====
<img src="/Home-bg/Home-bg-1.jpg" />

// ===== 修改後 =====
import Image from 'next/image'

<Image
  src="/Home-bg/Home-bg-1.jpg"
  width={1920}            // 圖片的原始寬度（用於計算比例）
  height={1080}           // 圖片的原始高度
  quality={75}            // 壓縮品質 75%（肉眼幾乎看不出差異）
  placeholder="blur"      // 載入時先顯示模糊預覽（需搭配 blurDataURL 或靜態 import）
  sizes="100vw"           // 告訴瀏覽器這張圖片佔滿整個視窗寬度
  alt="首頁背景圖片"
/>
```

#### 注意事項

- `next/image` 預設會在 server 端即時壓縮圖片，第一次請求會稍慢，之後會被快取
- 如果圖片是作為背景使用（CSS `background-image`），`<Image>` 元件可搭配 `fill` 屬性 + 父層 `position: relative` 使用
- 確認 `next.config.js` 裡的 `images` 設定允許本地圖片最佳化

#### 實際壓縮結果（2026-06-05 執行）

下表為實際跑 `compress-home-bg.mjs` 的結果（WebP, quality 75, 寬度上限 1920px）：

| 圖片 | 修改前 | 修改後 | 縮減幅度 |
|---|---|---|---|
| Home-bg-1 | 4.24 MB | 356 KB | -91.8% |
| Home-bg-2 | 789 KB | 212 KB | -73.2% |
| Home-bg-3 | 3.17 MB | 136 KB | -95.8% |
| Home-bg-4 | 5.91 MB | 357 KB | -94.1% |
| Home-bg-5 | 976 KB | 181 KB | -81.5% |
| Home-bg-6 | 2.71 MB | 220 KB | -92.1% |
| Home-bg-7 | 2.69 MB | 209 KB | -92.4% |
| Home-bg-8 | 1.54 MB | 185 KB | -88.2% |
| Home-bg-9 | 6.52 MB | 236 KB | -96.5% |
| Home-bg-10 | 2.42 MB | 199 KB | -91.9% |
| Home-bg-11 | 3.14 MB | 161 KB | -95.0% |
| **11 張合計** | **34.07 MB** | **2.40 MB** | **-93.0%** |

> 實際縮減幅度（93%）優於原預估（87-92%），且總大小（2.4MB）比預估下限（3MB）更小。

### 方案 B：手動預先壓縮（**最終採用**）

在 build 前先手動把 `public/Home-bg/` 內的 jpg 壓成 WebP。

**實際做法（與計畫的 `sharp-cli` 不同）**：Next.js 本來就內建 `sharp` 套件
（在 `frontend/node_modules` 裡），不需要另外 `npm install -g sharp-cli`。
因此改寫成一支 Node 腳本直接呼叫 `sharp`，並加上每張圖的壓縮前後大小報表：

```bash
# 腳本位置：frontend/scripts/compress-home-bg.mjs
# 執行方式（在 frontend 目錄下）：
cd frontend
node scripts/compress-home-bg.mjs
```

腳本核心邏輯（resize 限寬不放大 → 轉 WebP quality 75 → 寫檔）：

```js
await sharp(srcPath)
  .resize({ width: 1920, withoutEnlargement: true })
  .webp({ quality: 75 })
  .toFile(outPath);
```

**原圖處理（實際決策）**：計畫原建議保留 jpg 作 `<picture>` fallback，
但考量現代瀏覽器幾乎全面支援 WebP，最終**直接刪除所有 jpg、只保留 WebP**，
讓 `public/` 更乾淨。原圖在執行壓縮時已先備份至本機 `/tmp/home-bg-backup/`。

程式碼端只需把 `HeroSection.tsx` 的 `BACKGROUND_IMAGES` 陣列副檔名從
`.jpg` 改為 `.webp`，輪播邏輯完全不動：

```jsx
const BACKGROUND_IMAGES = [
  "/Home-bg/Home-bg-1.webp",   // 原為 .jpg
  // ...共 11 張
];
```

### 方案選擇建議

| | 方案 A（next/image） | 方案 B（手動壓縮） |
|---|---|---|
| 開發成本 | 低（改 JSX 標籤即可） | 中（需要建立壓縮流程） |
| 維護成本 | 低（新圖片自動壓縮） | 高（每次加圖片都要手動跑） |
| 彈性 | 高（自動根據裝置給最佳尺寸） | 低（固定產出一種尺寸） |
| 第一次請求速度 | 稍慢（server 端即時壓縮） | 快（圖片已經壓好了） |

**建議使用方案 A**，Next.js 的 `<Image>` 元件是框架原生支援的做法，長期維護最省力。

---

## 第二步：Cloudflare 快取設定

### 目標

確保靜態資源（圖片、CSS、JS）被 Cloudflare CDN 快取，讓全球使用者從最近的 CDN 節點取得資源，不需要每次都回源到 EC2。

### 2-1. Nginx 加上 Cache-Control Header

在 Nginx 的設定檔（`nginx/default.conf`）中，為靜態資源加上快取 header：

```nginx
# 靜態資源：圖片、字型、CSS、JS
location ~* \.(jpg|jpeg|png|gif|webp|avif|svg|ico|woff|woff2|ttf|css|js)$ {
    proxy_pass http://frontend:3000;

    # 告訴 Cloudflare 和瀏覽器：這些檔案可以快取 30 天
    expires 30d;
    add_header Cache-Control "public, max-age=2592000, immutable";

    # 關閉不需要的 header，減少 response 大小
    proxy_hide_header X-Powered-By;
}
```

各參數的意義：

- `public`：允許 CDN（Cloudflare）和瀏覽器都快取
- `max-age=2592000`：快取有效期 30 天（2592000 秒）
- `immutable`：告訴瀏覽器這個檔案在有效期內不會變，不需要發重新驗證請求

### 2-2. Cloudflare Dashboard 設定

登入 Cloudflare Dashboard，在 `easy-travel-scheduler.linkuankuan.com` 的設定中確認以下項目：

1. **Caching > Configuration**
   - Caching Level：設為 `Standard`
   - Browser Cache TTL：設為 `Respect Existing Headers`（讓 Nginx 的 Cache-Control 生效）

2. **Caching > Cache Rules**（可選，進階控制）
   - 建立規則：當 URI Path 符合 `*.jpg` `*.png` `*.webp` `*.css` `*.js` 時
   - Edge TTL：30 天
   - Browser TTL：30 天

3. **Speed > Optimization > Content Optimization**
   - 開啟 Polish（圖片壓縮，Pro 以上方案才有）
   - 開啟 Brotli 壓縮

### 2-3. 驗證快取是否生效

部署後用 curl 檢查 response header：

```bash
curl -I https://easy-travel-scheduler.linkuankuan.com/Home-bg/Home-bg-1.webp
```

確認以下 header：

```
# 應該看到的（正常快取中）：
cache-control: public, max-age=2592000, immutable
cf-cache-status: HIT          ← Cloudflare 有快取，直接回

# 第一次請求可能看到：
cf-cache-status: MISS         ← 第一次沒快取，從 EC2 拿
cf-cache-status: EXPIRED      ← 快取過期，重新去 EC2 拿

# 不應該看到的：
cf-cache-status: DYNAMIC      ← Cloudflare 把這個當動態內容，沒快取
cf-cache-status: BYPASS       ← 被規則繞過快取
```

---

## 實作順序與檢核清單

> 勾選說明：✅ 已完成 ｜ ⬜ 待辦（多為需登入外部服務或部署正式站才能做的步驟）

### Phase 1：圖片壓縮 ✅ 已完成（採方案 B）

- [x] 盤點 `public/Home-bg/` 內所有圖片的檔案大小（合計 34.07 MB）
- [x] 用 `scripts/compress-home-bg.mjs` 批次壓成 WebP（取代計畫的 `<img>`→`<Image>`）
- [x] 將 `HeroSection.tsx` 的 `BACKGROUND_IMAGES` 副檔名改為 `.webp`
- [x] 刪除原始 jpg（只留 WebP，原圖已備份至 `/tmp/home-bg-backup/`）
- [x] 本地測試：`curl` 驗證 webp 回 200 + `image/webp`、舊 jpg 回 404、首頁 HTML 正確引用 webp
- [x] ESLint 通過、11 張 webp metadata 全部有效（1920px 寬）

### Phase 2：快取設定（部分完成）

- [x] 修改 `nginx/default.conf`，加上靜態資源 `location` 與 Cache-Control header
- [x] 用容器跑 `nginx -t` 驗證設定語法正確
- [ ] 部署到 EC2、重啟 Nginx 容器使設定生效
- [ ] 登入 Cloudflare Dashboard 確認快取設定（Browser Cache TTL → Respect Existing Headers）
- [ ] 用 `curl -I` 驗證 `cf-cache-status` 是否為 HIT
- [ ] 用 Cloudflare 的 Purge Cache 清除舊快取，確保新設定生效

### Phase 3：驗收 ⬜ 待辦（需部署正式站後執行）

- [ ] 開無痕視窗瀏覽網站，用 DevTools 確認首頁載入時間
- [ ] 確認 Nginx log 不再出現 `buffered to a temporary file` 警告
- [ ] 確認重複訪問時圖片從 Cloudflare 快取取得（`cf-cache-status: HIT`）

---

## 預期改善成果

| 指標 | 改善前 | 改善後 |
|---|---|---|
| 首頁圖片總大小 | ~40 MB | ~3-5 MB |
| 首次載入時間（4G 網路） | 10 秒以上 | 2-3 秒 |
| 重複訪問載入時間 | 仍需從 EC2 拿 | 毫秒級（CDN 快取） |
| EC2 圖片頻寬消耗 | 每個使用者 ~40 MB | 幾乎為 0（CDN 承擔） |
| Nginx buffer 警告 | 每次請求都出現 | 消失 |
