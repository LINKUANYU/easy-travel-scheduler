# Easy Travel Scheduler — 前端重構任務清單

> 本清單彙整所有已學過的觀念對應到實際程式碼的待重構項目。
> 每完成一項,請將 `[ ]` 改為 `[x]`,並記錄完成日期。
>
> **建議使用方式:**
> 1. 開新對話視窗,貼上「專案 Instructions」、`frontend_learning_progress.md`、本清單
> 2. 告訴 Claude:「我要開始第 N 項重構,請先檢視要改哪些地方」
> 3. 確認方向後,請 Claude 產生丟給新對話(或 Claude Code)的 prompt
> 4. 執行完成後,回此清單劃掉項目並補上完成日期

---

## 進度總覽

### 🔴 高優先(觀念明確、改動範圍清楚)

- [x] **重構 #1**:`useEditData` Hook 拆分(SRP) ✅ 2026-05-12
- [~] **重構 #2**:`next.config.ts` 新增 `remotePatterns` 圖片白名單 ⛔ 取消，見說明
- [~] **重構 #3**:`TripCard` 換成 `next/image` ⛔ 取消，見說明
- [~] **重構 #4**:`ExploreTripCard` 換成 `next/image` ⛔ 取消，見說明
- [~] **重構 #5**:`AttractionCard` 換成 `next/image` ⛔ 取消，見說明
- [x] **重構 #10**:`TripCard` / `ExploreTripCard` 死碼清理 ✅ 2026-05-12

### 🟡 中優先(觀念已學、設計已定,待實作)

- [x] **重構 #6**:`all-types.ts` 補上 `TripData` 與 `User` 型別，並依領域拆分 ✅ 2026-05-11
- [x] **重構 #7**:`api.ts` 加入 Zod 驗證層 ✅ 2026-05-12
- [x] **重構 #11**:呼叫端補型別與 Zod Schema（漸進式 - 第一輪）✅ 2026-05-22
- [ ] **重構 #12**:剩餘呼叫端補 schema（漸進式 - 第二輪）
- [x] **重構 #8**:首頁 SSR 重構(`ExploreSection` 改 Server Component) ✅ 2026-05-12
- [x] **重構 #9**:分享頁 SSR 重構(加 `generateMetadata()`) ✅ 2026-05-12

---

## 🔴 高優先項目

### 重構 #1:`useEditData` Hook 拆分(SRP)

**對象檔案:**
- 主要:`frontend/app/hooks/useEditData.ts`
- 新增(預計):
  - `frontend/app/hooks/useItineraryQueries.ts`
  - `frontend/app/hooks/useDraftState.ts`
- 不需動到:`frontend/app/edit/[tripId]/edit-workspace.tsx`(對外介面保持不變)

**重構內容:**

依職責拆成多個小 Hook,用大總管組合:

| 小 Hook | 職責 | 內含 |
|---|---|---|
| `useItineraryQueries(tripId, activeDay)` | 純資料獲取 | `placesQ`、`summaryQ`、`dayItinQ` |
| `useDraftState(activeDay)` | 本地草稿狀態 | `draftItemsByDay`、`draftLegModeByDay`、`timeDraftByDay`、`dirtyDayMap` |
| `useEditData(tripId, days)` | 大總管(Facade) | 組合三個 query + 草稿 + `useRouteCalculator` + `usePlacePreview`,計算衍生資料、組合對外介面 |

**核心原則:**
- 大總管的 `return` 物件必須與現在完全相同(對外合約不變)
- 小 Hook 不知道彼此的存在,各自獨立
- 衍生資料(`scheduledMap`、`sortedPlaces`、`placeByDestinationId`)留在大總管,因為需要組合多個來源

**相關觀念:**
- 單一職責原則(SRP):一個模組只應有一個改變的理由
- Facade 模式:對外介面不變,內部拆分
- Hook 之間是「依賴」不是「繼承」

**預期成果:**
- `useEditData.ts` 從約 300 行降到約 100 行(只負責組合)
- 每個小 Hook 可獨立閱讀、獨立測試
- 未來 API 改格式只需動 `useItineraryQueries`,草稿邏輯改變只需動 `useDraftState`

**完成日期:** 2026-05-12

---

### ~~重構 #2:`next.config.ts` 新增 `remotePatterns` 圖片白名單~~ ⛔ 取消

**取消原因（2026-05-12 調查後確認）:**

原本預期 `remotePatterns` 能讓 `<Image>` 正常載入 Google Places 圖片，但實際調查後發現：

1. **圖片來源的本質**：`fetchPlaceThumb` 使用 Google Places JS SDK（瀏覽器端）的 `photo.getURI()` 產出 URL，格式為 `https://places.googleapis.com/v1/places/.../photos/.../media?key=...`

2. **302 Redirect 問題**：這個 URL 本身不是圖片，它會先 302 redirect 到 `lh3.googleusercontent.com` 才是真正的圖片位址

3. **`/_next/image` 不跟 redirect**：Next.js 的圖片代理基於 SSRF 防護，看到 302 直接拒絕，`remotePatterns` 白名單只能驗證「你給的第一個 URL」，無法驗證 redirect 後的目的地，所以加白名單也無法解決問題

4. **正確解法**：在 `<Image>` 加上 `unoptimized={!!googleUrl}`，讓 Google 圖片直接由瀏覽器抓，跳過 Next.js 代理。瀏覽器會自動跟隨 redirect，且 Google CDN 本身已最佳化，不需要 Next.js 額外處理

**保留的觀念（不浪費）:**
- `remotePatterns` 的 SSRF 防護機制已透過三階段實驗親身驗證
- 未來若有圖片來源是「直接靜態 URL（非 redirect）」，此設定仍適用

---

### ~~重構 #3:`TripCard` 換成 `next/image`~~ ⛔ 取消

**取消原因（2026-05-12 調查後確認）:**

原本預期換成 `<Image>` 可獲得 WebP 轉換、尺寸縮放、Lazy Loading 等效益，但因為 **#2 的 redirect 問題**，必須使用 `unoptimized`，導致：

- ❌ WebP / AVIF 自動轉換：無法獲得（需透過代理才能轉換）
- ❌ Next.js 層的尺寸縮放與快取：無法獲得
- ✅ Lazy Loading：`unoptimized` 仍然保留此效益
- ✅ CLS 防護：`fill` 模式仍然保留此效益

**評估結論:**
- 效益不足以支撐重構成本
- 死碼清理（`urls`、`imgIndex`、JSON parse）的需求獨立拆出為 **重構 #10**，針對性處理
- `<img>` 維持現狀，不做替換

---

### ~~重構 #4:`ExploreTripCard` 換成 `next/image`~~ ⛔ 取消

**取消原因:** 同重構 #3，圖片來源相同（`fetchPlaceThumb`），有相同的 redirect 問題，`unoptimized` 後效益不足。死碼清理需求納入 **重構 #10**。

---

### ~~重構 #5:`AttractionCard` 換成 `next/image`~~ ⛔ 取消

**取消原因:** 同重構 #3，圖片來源相同（`fetchPlaceThumb`），有相同的 redirect 問題。

**注意**：`AttractionCard` 本身已使用 boolean `imgError` 做容錯，邏輯已是乾淨狀態，**不需要額外的死碼清理**，因此不納入重構 #10。

---

### 重構 #10:`TripCard` / `ExploreTripCard` 死碼清理 ✅

**對象檔案:**
- `frontend/app/components/dashboard/TripCard.tsx`
- `frontend/app/components/home/ExploreTripCard.tsx`

**完成日期:** 2026-05-12

**實際完成內容:**

移除早期 DuckDuckGo 多圖輪替的死碼，簡化為 boolean 容錯邏輯：

```typescript
// 清理前（死碼）
const urls = useMemo<string[]>(() => { ... }, [trip.cover_url]);
const [imgIndex, setImgIndex] = useState(0);
const currentImageSrc = urls.length > 0 && imgIndex < urls.length
  ? urls[imgIndex] : thumb?.url ? thumb.url : "/default-trip-cover.png";

// 清理後
const [imgError, setImgError] = useState(false);
const currentImageSrc = !imgError && thumb?.url
  ? thumb.url : "/default-trip-cover.png";
```

**主要學到的東西:**
- 死碼識別：程式邏輯走不到的分支比沒用的變數更難發現
- `useMemo` / `useState` 移除後要同步清理 import
- boolean state 管理容錯比多重條件判斷更易讀

---

## 🟡 中優先項目

### 重構 #6:`all-types.ts` 依領域拆分型別檔案 ✅

**完成日期:** 2026-05-11

**實際完成內容（超出原始範圍）:**

原本只計畫補上 `TripData` 與 `User`，實際上進一步將整個 `all-types.ts` 依資料領域拆分：

```
frontend/app/types/
  user.ts        ← User
  trip.ts        ← TripData、TripPlace、SharedTripDataOut
  itinerary.ts   ← ItineraryItem、ItinerarySummaryRow、SharedItineraryItem
  map.ts         ← TravelMode、LegRouteState
  attraction.ts  ← Attraction（AttractionImage 移除 export，僅內部使用）
```

`all-types.ts` 已刪除（確認無任何檔案引用後刪除）。

**主要學到的東西:**
- 型別應依「資料本質」分類，而非依「使用位置」或「技術層」
- `AttractionImage` 只被 `Attraction` 內部使用，移除 `export` 即可，不需刪除
- 驗證引用是否乾淨應用 `grep -r "all-types" frontend/ --exclude-dir=".next" --include="*.ts" --include="*.tsx"`，不能只靠肉眼或 VS Code 搜尋（VS Code 預設排除 `.next/`，grep 不會）
- 架構債要趁早還，型別少時整理遠比型別多時輕鬆

---

### 重構 #7:`api.ts` 加入 Zod 驗證層 ✅

**對象檔案:**
- 主要:`frontend/app/lib/api.ts`

**完成日期:** 2026-05-12

**實際完成內容:**

```
api.ts
├── 私有 apiFetch<T, S>()      ← 統一底層，消除五個函式的重複邏輯
├── ApiFetchOptions<S>          ← 選填 schema 的 options 型別
├── ApiFetchResult<T, S>        ← 條件回傳型別（有 schema 推導，沒有用 T）
└── 公開函式（apiGet / apiPost / apiDelete / apiPut / apiPatch）
      body 型別：any → Record<string, unknown> | unknown[]
      新增 options?: { schema?: S } 選填參數
```

**泛型設計決策：**
- 兩個泛型：`T`（沒傳 schema 時手動指定）、`S extends z.ZodType`（捕捉 schema 型別）
- 條件回傳：`S extends z.ZodType ? z.infer<S> : T`
- 有傳 schema 時型別自動推導，不需手動寫泛型，避免資訊重複說兩次

**錯誤分類：**
- HTTP 錯誤（4xx/5xx）：拋出 `ApiError`（`err.status` 可判斷）
- Zod 驗證失敗：拋出帶 `cause: "validation"` 的 Error，兩者明確區分

**主要學到的東西:**
- TypeScript 型別只存在編譯時，Zod Schema 在執行時還存在，兩層防護各自負責不同時機
- `as T` 是假的型別安全；`schema.parse()` 是真正的執行期驗證
- 條件型別（Conditional Types）：`S extends ZodType ? z.infer<S> : T` 讓函式根據是否傳 schema 自動決定回傳型別
- 漸進式重構：api.ts 本身改好，呼叫端不需一次全改，各自補 schema（→ 重構 #11）
- 資訊不應重複說兩次：有傳 schema 就不需再手動寫泛型，若兩者不同步 TypeScript 也不會報錯

---

### 重構 #8:首頁 SSR 重構(`ExploreSection` 改 Server Component) ✅

**對象檔案:**
- `frontend/app/page.tsx`（拆分）
- 新增：`frontend/app/components/home/HeroSection.tsx`（"use client"）
- 新增：`frontend/app/components/home/ExploreSection.tsx`（Server Component）
- 新增：`frontend/app/api/revalidate/route.ts`（On-Demand Revalidation 預留）
- 修改：`frontend/app/components/home/ExploreTripCard.tsx`（加 `useIsRestoring()`）

**完成日期:** 2026-05-12

**設計決策：為何從 ISR 改為 SSR**

原計畫用 ISR（`revalidate = 300`），但評估後改為 SSR（`cache: "no-store"`）：

| 考量點 | ISR | SSR（最終選擇） |
|---|---|---|
| 後端行程資料 | 快取最多 5 分鐘過時 | 每次進頁面都是最新 |
| On-Demand Revalidation | 需要後端串接觸發點 | 不需要 |
| 目前行程是否有公開/私人切換 | ❌ 尚未實作 | 無所謂 |
| 適用時機 | 有明確失效觸發點時 | 資料異動頻繁、觸發點不明確時 |

後端「探索熱門行程」API 直接抓時間最新幾筆，沒有演算法篩選，新行程建立後應立即反映，故選 SSR。ISR + On-Demand Revalidation 留待未來「公開/私人切換」功能完成後再補。

**實際完成內容：**

```
page.tsx（Server Component，無 revalidate，預設 SSR）
├── HeroSection.tsx（"use client"）
│     背景輪播、SearchPanel、CreateTripModal、AddPlacesToTripBtn
│     useTripDraft、useRouter 全部移入此處
└── ExploreSection.tsx（Server Component，async function）
      fetch(url, { cache: "no-store" }) 在 Server 端直接打後端
      TripData[] 序列化後傳給 ExploreTripCard（Client Component）
```

**`ExploreSection.tsx` 核心細節：**
- URL：`process.env.API_BASE_URL ?? "http://backend:8000"`（非 `NEXT_PUBLIC_`，Server 專用）
- `fetch` 加 `cache: "no-store"`，明確宣告不快取，等同 SSR 語意
- 失敗時 return 空陣列，不 throw，首頁不因此崩潰
- `ExploreTripCard` 完全不動（`usePlaceThumb` 的 `useQuery` 仍在 Client 端執行）

**額外修復：`ExploreTripCard` 的圖片 Race Condition**

重構過程中發現圖片時好時壞的問題，根本原因：

```
重新整理後：
  PersistQueryClientProvider 從 sessionStorage 還原快取（非同步）
  ↕ 同時發生
  ExploreTripCard render → thumb = undefined → 顯示預設圖

還原完成後：staleTime: Infinity → useQuery 認為資料新鮮，不重打 API
           → 不觸發重新 render → 圖片永遠停在預設圖 ❌
```

修法：加上 `useIsRestoring()`，還原期間顯示 Skeleton，還原完成時 state 從 `true` → `false` 觸發重新 render，`useQuery` 才有機會讀到還原後的快取。

```tsx
const isRestoring = useIsRestoring();

{isRestoring ? (
  <div className="w-full h-full bg-slate-200 animate-pulse" />
) : (
  <img src={currentImageSrc} ... />
)}
```

**主要學到的東西:**
- ISR vs SSR 的選擇邏輯：資料失效觸發點明確 → ISR；資料動態、無觸發點 → SSR
- On-Demand Revalidation 原理：後端打 Next.js 的 `/api/revalidate` endpoint，呼叫 `revalidatePath('/')` 精確清除快取，兼顧效能與即時性
- `API_BASE_URL` vs `NEXT_PUBLIC_API_BASE_URL`：Server Component 用前者（不暴露給瀏覽器），Client Component 用後者
- `PersistQueryClientProvider` + `staleTime: Infinity` 的陷阱：快取還原是非同步的，Component 可能在還原完成前就 render 完，之後不會再更新
- `useIsRestoring()` 的原理：本質是利用 state 改變（`true` → `false`）觸發 Component 重新 render，讓 `useQuery` 有機會讀到完整快取，走的是「state 改變觸發 render」而非「重打 API」這條路
- Race Condition 類的 bug 特徵：時好時壞，原因是兩個非同步操作的完成順序不固定

---

### 重構 #9:分享頁 SSR 重構(加 `generateMetadata()`) ✅

**對象檔案:**
- `frontend/app/share/[token]/page.tsx`
- `frontend/app/share/[token]/ShareWorkspace.tsx`

**完成日期:** 2026-05-12

**實際完成內容:**

```
page.tsx（Server Component + SSR）
│  ← fetchSharedTrip(token) 在 Server 端打後端 API
│  ← generateMetadata() 產生動態 Open Graph 標籤
│  ← token 不存在時呼叫 notFound()，不把錯誤往下傳
└── ShareWorkspace.tsx（"use client"）
      Props 從 { token } 改為 { data: SharedTripDataOut }
```

**`page.tsx` 核心改動:**
- 新增 `fetchSharedTrip(token)` 函式，使用原生 `fetch` 搭配 `API_BASE_URL` 環境變數（預設 `http://backend:8000`）直接打後端，不走 Next.js rewrite
- Server 端 `fetch` 必須使用完整絕對路徑，相對路徑 `/api/...` 是給瀏覽器用的
- `generateMetadata()` 和 `page()` 都呼叫同一個 `fetchSharedTrip()`，Next.js Request Memoization 確保只打一次 API
- OG 圖片使用 `/og-image.png`（相對路徑），由 `layout.tsx` 的 `metadataBase` 自動補成完整 URL
- token 不存在（API 回 404）→ 呼叫 `notFound()`，由 Next.js 渲染 404 頁面

**`ShareWorkspace.tsx` 核心改動:**
- Props 從 `{ token: string }` 改為 `{ data: SharedTripDataOut }`
- 移除 `useQuery(["shared-trip", token])` 初始資料抓取
- 移除 `isPending`、`error` 狀態與對應的 loading / 錯誤畫面 JSX
- 移除 `showLoadingUI` state 與相關 `useEffect`（資料已在 Server 端準備好，不需要 loading 動畫）
- 移除 `LogoSpinner` import
- 修正 import 路徑：`@/app/types/all-types` → `@/app/types/trip`
- 保留所有互動邏輯不動（地圖、按鈕、新手導覽 driver.js、`isOwner` 判斷）

**主要學到的東西:**
- `generateMetadata()` 負責 `<head>` meta 標籤，`page()` 負責 `<body>` 內容，兩者合併成同一份 HTML
- Request Memoization 只對原生 `fetch()` 且 URL 完全相同時生效；使用 `axios` 需改用 React `cache()` 手動包
- 錯誤應在發生的地方處理（Server 端 `notFound()`），不把不確定性往下傳，Props 型別因此可以是 `T` 而非 `T | null`
- Server Component 的 `fetch` 需要完整 URL（Docker 內部網路 `http://backend:8000`），不能用瀏覽器慣用的相對路徑

---

### 重構 #11:呼叫端補型別與 Zod Schema（漸進式 - 第一輪）

**設計決策（與 Claude 討論確認）：**

- **方案 C**：`schemas.ts` 為「真相來源」，型別從 schema 用 `z.infer` 推導；`types/` 內所有 API 邊界型別檔案改為由 `schemas.ts` 取代
- **單檔 `schemas.ts`**：內部分區段（基礎 Schema、端點 Schema），未來規模變大再考慮拆分
- **保留 `types/map.ts`**：`TravelMode`、`LegRouteState` 是純前端內部型別，與 API 邊界無關
- **保守用 `.nullish()`**：後端 `Optional[str]` 可能輸出 `null` 也可能省略 key，前端用 `.nullish()` 同時接受兩種
- **這次不做的事**：欄位驗證（`.email()`、`.min()` 等）、request body 驗證、不碰 `SearchResponse`、不碰 `useEditData` 內的 mutations 與 `edit-workspace.tsx` 的 `apiGet<any>`（→ 留給重構 #12）

**範疇紀律：**
這次重構嚴格鎖死範圍，不順手擴張。原本標為「最後補」的 `useEditData` 三個 query，因為需要先決定 `normalizeArrayPayload` 的命運（是拿掉、留著、或用 Zod union 表達），屬於「**需要新的設計討論**」的項目，獨立為 **重構 #12** 處理。

**對象檔案:**

新增：
- `frontend/app/lib/schemas.ts`（統一放所有 Zod Schema 與型別推導）

刪除（搬到 schemas.ts 後）：
- `frontend/app/types/user.ts`
- `frontend/app/types/trip.ts`
- `frontend/app/types/attraction.ts`
- `frontend/app/types/itinerary.ts`

保留：
- `frontend/app/types/map.ts`（純前端內部型別）

修改（🔴 優先：加 schema 驗證）：
- `frontend/app/context/AuthContext.tsx`（`/api/me`）
- `frontend/app/hooks/useTrips.ts`（`/api/trips`）
- `frontend/app/components/home/CreateTripModal.tsx`（`POST /api/trips`）
- `frontend/app/search/page.tsx`（`/api/trips/:id/places`）

修改（🟡 補 `<void>` 泛型，不加 schema）：
- `frontend/app/context/AuthContext.tsx`（`apiPost("/api/logout")`）
- `frontend/app/components/layout/AuthCorner.tsx`（login / signup / bind 共三個）
- `frontend/app/components/home/AddPlacesToTripBtn.tsx`（一個 `apiPost`）

修改（更新 import path，不動業務邏輯）：
- `frontend/app/components/home/ExploreSection.tsx`
- `frontend/app/components/home/ExploreTripCard.tsx`
- `frontend/app/components/dashboard/TripCard.tsx`
- `frontend/app/share/[token]/ShareWorkspace.tsx`
- `frontend/app/components/search/ResultsSection.tsx`
- `frontend/app/components/search/AttractionCard.tsx`
- `frontend/app/hooks/useItineraryQueries.ts`
- `frontend/app/hooks/useEditData.ts`
- `frontend/app/hooks/usePlaceThumbnails.ts`

**改動清單（🔴 優先，回傳值直接進 UI）：**

| 呼叫端 | 現況 | 要改成 |
|---|---|---|
| `AuthContext.tsx` `apiGet<User>("/api/me")` | 無 schema | `apiGet("/api/me", { schema: MeResponseSchema })` |
| `useTrips.ts` `apiGet<TripData[]>("/api/trips")` | 無 schema | `apiGet("/api/trips", { schema: TripDataListSchema })` |
| `CreateTripModal.tsx` `apiPost<CreateTripRes>("/api/trips", ...)` | 無 schema | `apiPost("/api/trips", payload, { schema: CreateTripResSchema })` |
| `search/page.tsx` `apiGet<any[]>("/api/trips/:id/places")` | 完全裸奔 | `apiGet(..., { schema: TripPlaceListSchema })` |

**改動清單（🟡 過水用 `<void>`，不加 schema）：**

| 呼叫端 | 現況 | 要改成 |
|---|---|---|
| `apiPost("/api/logout")` | 無泛型 | `apiPost<void>("/api/logout")` |
| `apiPost("/api/login")` / `apiPost("/api/signup")` | 無泛型 | `apiPost<void>(...)` |
| `apiPatch("/api/trips/:id/bind")` | 無泛型 | `apiPatch<void>(...)` |
| `apiPost("/api/trips/:id/places")` | 無泛型 | `apiPost<void>(...)` |

**設計原則：**
- 所有 Schema 集中放 `schemas.ts`，不散落各呼叫端
- `z.infer<typeof XxxSchema>` 取代手動型別定義（型別與 Schema 永遠同步）
- `any[]` 一律先補具體型別，再加 schema
- 基礎 Schema 與端點 Schema 分離：基礎描述「一個東西」（如 `UserSchema`），端點描述「API 怎麼包裝」（如 `MeResponseSchema = UserSchema.nullable()`）

**完成日期:** 2026-05-22

**實際完成內容：**

新增 `frontend/app/lib/schemas.ts`（約 150 行），分兩區段：
- **區段 1**：7 個基礎 Schema + `z.infer` 型別推導（`User`、`TripData`、`TripPlace`、`ItineraryItem`、`ItinerarySummaryRow`、`Attraction`、`SharedItineraryItem`）
- **區段 2**：9 個端點 Schema（`MeResponseSchema`、`TripDataListSchema`、`TripPlaceListSchema`、`ItineraryItemListSchema`、`ItinerarySummaryListSchema`、`CreateTripResSchema`、`SharedTripDataOutSchema` 等）

刪除 `types/{user,trip,attraction,itinerary}.ts`，保留 `types/map.ts`。

**額外發現（spec 未列，執行 grep 後發現）：**

下列檔案也引用了舊型別路徑，一併更新 import path：
- `components/edit/PlacePoolPanel.tsx`
- `components/edit/TripMap.tsx`
- `components/edit/DailyItineraryPanel.tsx`
- `components/share/DayScheduleCard.tsx`
- `hooks/useRouteCalculator.ts`
- `hooks/useDraftState.ts`
- `lib/edit/itinerary-route-leg.ts`

**型別修正（`.nullish()` 引發的漣漪）：**

舊 `TripPlace.place_name` 型別是 `string | undefined`（`?:`），新 schema 改用 `.nullish()` 變成 `string | null | undefined`。傳給 `alt`、`onUpdatePreview()` 等只接受 `string | undefined` 的地方，需在呼叫點加 `?? undefined` 消除 `null`：

```tsx
// 修正前（TypeScript 報錯）
alt={p.place_name}
onClick={() => onUpdatePreview(p.google_place_id, p.place_name)}

// 修正後
alt={p.place_name ?? undefined}
onClick={() => onUpdatePreview(p.google_place_id, p.place_name ?? undefined)}
```

影響檔案：`PlacePoolPanel.tsx`、`DailyItineraryPanel.tsx`。

**主要學到的東西:**
- Schema 是「真相來源（Single Source of Truth）」，型別從 `z.infer` 推導，永遠不會與驗證邏輯不同步
- 端點 Schema 與基礎 Schema 分離：基礎描述「一個東西長什麼樣」（`TripDataSchema`），端點描述「API 怎麼包裝它」（`TripDataListSchema = z.array(TripDataSchema)`）
- `.nullish()` 比 `?:` 更精確：後端 `Optional[str]` 可能輸出 `null` 也可能省略 key，`.nullish()` 同時接受兩種；但這會讓型別「加寬」，傳給舊介面需要在呼叫點手動收窄（`?? undefined`）
- 有傳 schema 就不需要手動寫泛型（`apiGet("/api/me", { schema: MeResponseSchema })` 而非 `apiGet<User>(...)`），型別由條件推導（Conditional Types）自動決定，重複寫反而是反模式
- grep 驗證是收尾必做動作：VS Code 搜尋預設排除 `.next/`，但 grep 不會，只有 `grep -r ... --exclude-dir=".next"` 才能確認引用已全部清除

---

### 重構 #12:剩餘呼叫端補 schema（漸進式 - 第二輪）

**背景：**
重構 #11 為了維持範圍紀律，將以下三類呼叫端獨立為第二輪處理。這三類各自有「需要先做的小決策」，不適合塞進第一輪。

**對象檔案與三類項目：**

**A 類：`useItineraryQueries.ts` 的三個 apiGet（需先決定 `normalizeArrayPayload` 的命運）**

```ts
queryFn: async () =>
  normalizeArrayPayload<TripPlace>(await apiGet(`/api/trips/${tripId}/places`)),
```

外層包了一個 `normalizeArrayPayload`，做「容忍後端可能回直接陣列或 `{data: [...]}`」的保險。需先決定：
- (a) 直接拿掉 `normalizeArrayPayload`，相信後端 + Zod 嚴格驗證
- (b) 留著 `normalizeArrayPayload`，再用 Zod 驗（兩層職責重疊）
- (c) 用 Zod 的 `z.union([...]).transform(...)` 表達容錯

這是新的設計決策，獨立討論。

**B 類：`useEditData.ts` 的 mutations**

- `apiPost<ItineraryItem>(.../itinerary)` — 加入景點到當日排程，回傳新建項目
- `apiPost(.../places)` — 加入景點池（無回傳值）
- `apiDelete(.../places/:id)` — 移除景點池
- 其他 Mutation 視當下狀況檢視

設計討論點：
- 哪些 mutation 的回傳值會被使用？需要 schema 驗證
- 哪些只在意成功/失敗？補 `<void>` 即可

**C 類：`edit-workspace.tsx` 的 `apiGet<any>`**

```ts
const tripQ = useQuery({
  queryKey: ["trip", tid],
  queryFn: async () => apiGet<any>(`/api/trips/${tid}`),
});
```

需要新增一個 `TripDetailSchema`（對應後端 `TripOut`），與列表 `TripDataSchema` 欄位不同（沒有 `share_token`、`cover_url` 等）。

**完成日期:** ⬜

---

## 進度紀錄區

> 每完成一項,請在此處記錄,以便日後回顧。

| 項目 | 完成日期 | 主要學到的東西 |
|---|---|---|
| 重構 #6 | 2026-05-11 | 型別依資料本質分領域、grep 排除 .next 的正確用法、架構債要趁早還 |
| 重構 #2 | 2026-05-12 | `/_next/image` 代理機制、SSRF 防護原理、302 redirect 為何被擋、EC2 IMDS 攻擊面（三階段實驗） → 最終取消，原因見 #2 說明 |
| 重構 #3~#5 | 2026-05-12 | `unoptimized` 的取捨：Google CDN 已最佳化，跳過代理是合理的；效益不足以支撐重構 → 取消，死碼清理獨立為 #10 |
| 重構 #10 | 2026-05-12 | 死碼識別與清除、useMemo / useState 的 import 清理、boolean state 管理圖片容錯邏輯 |
| 重構 #1 | 2026-05-12 | SRP 單一職責原則、Facade 模式、共享狀態提升（activeDay）、Hook 拆分邊界判斷（useItineraryQueries + useDraftState + 大總管） |
| 重構 #9 | 2026-05-12 | SSR vs React Query 的本質差異、generateMetadata() OG 標籤、Request Memoization 的前提條件、Server fetch 需完整 URL、notFound() 在伺服器端處理錯誤讓 Props 型別更乾淨 |
| 重構 #8 | 2026-05-12 | ISR vs SSR 選擇邏輯（失效觸發點是否明確）、On-Demand Revalidation 原理（預留）、`API_BASE_URL` vs `NEXT_PUBLIC_` 使用邊界、`PersistQueryClientProvider` + `staleTime: Infinity` 的 Race Condition 陷阱、`useIsRestoring()` 用 state 改變觸發 render 的解法 |
| 重構 #7 | 2026-05-12 | TypeScript 型別（編譯期）vs Zod（執行期）兩層防護、條件型別推導（有 schema 自動推、沒 schema 用 T）、`apiFetch` 抽出消除重複、HTTP 錯誤 vs 驗證錯誤分類、漸進式重構策略 |
| 重構 #11 | 2026-05-22 | Schema 為 Single Source of Truth、端點 Schema vs 基礎 Schema 分離、`.nullish()` 型別加寬的漣漪與呼叫點收窄、有 schema 不需手動寫泛型、grep 驗證引用清除的重要性 |
