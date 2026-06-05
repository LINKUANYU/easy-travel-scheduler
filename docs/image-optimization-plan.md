# 圖片最佳化與快取重構計畫

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

### 方案 A：使用 Next.js `<Image>` 元件（推薦）

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

#### 預估效果

| 圖片 | 修改前 | 修改後（WebP, quality=75） | 縮減幅度 |
|---|---|---|---|
| Home-bg-1.jpg | 4.4 MB | ~200-400 KB | 約 90-95% |
| Home-bg-4.jpg | 6.2 MB | ~300-500 KB | 約 90-95% |
| Home-bg-9.jpg | 6.8 MB | ~300-500 KB | 約 90-95% |
| 11 張合計 | ~40 MB | ~3-5 MB | 約 87-92% |

### 方案 B：手動預先壓縮（備選）

如果不想用 `next/image` 的即時壓縮，可以在 build 前先手動壓縮圖片，放回 `public/` 資料夾。

```bash
# 安裝壓縮工具
npm install -g sharp-cli

# 批次壓縮：轉 WebP、品質 75%、寬度上限 1920px
for f in public/Home-bg/*.jpg; do
  sharp -i "$f" -o "${f%.jpg}.webp" -- resize 1920 --withoutEnlargement --webp '{"quality": 75}'
done
```

然後在程式碼裡改用 `.webp` 檔案，並用 `<picture>` 標籤提供 fallback：

```html
<picture>
  <source srcset="/Home-bg/Home-bg-1.webp" type="image/webp" />
  <img src="/Home-bg/Home-bg-1.jpg" alt="首頁背景圖片" />
</picture>
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
curl -I https://easy-travel-scheduler.linkuankuan.com/Home-bg/Home-bg-1.jpg
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

### Phase 1：圖片壓縮（預計 1-2 小時）

- [ ] 盤點 `public/Home-bg/` 內所有圖片的檔案大小
- [ ] 將所有 `<img>` 標籤改為 Next.js `<Image>` 元件
- [ ] 確認 `next.config.js` 的 `images` 設定正確
- [ ] 本地開發環境測試：圖片是否正常顯示、是否輸出 WebP
- [ ] 用 Chrome DevTools 的 Network tab 確認圖片大小已縮小

### Phase 2：快取設定（預計 30 分鐘 - 1 小時）

- [ ] 修改 `nginx/default.conf`，加上靜態資源的 Cache-Control header
- [ ] 重新部署 Nginx 容器（`docker compose up -d nginx`）
- [ ] 登入 Cloudflare Dashboard 確認快取設定
- [ ] 用 `curl -I` 驗證 `cf-cache-status` 是否為 HIT
- [ ] 用 Cloudflare 的 Purge Cache 清除舊快取，確保新設定生效

### Phase 3：驗收（預計 15 分鐘）

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
