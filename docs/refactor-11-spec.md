# 重構 #11:呼叫端補型別與 Zod Schema(漸進式 - 第一輪)

## 任務目標

新增 `frontend/app/lib/schemas.ts` 作為前端「資料契約源頭」,將原本散落在 `types/` 內各檔案的 API 邊界型別搬遷至此並改用 Zod Schema 定義,讓 TypeScript 型別自動從 schema 推導(`z.infer`)。同時:

1. 為四個🔴優先呼叫端加上 schema 驗證
2. 為四個🟡呼叫端補上 `<void>` 泛型
3. 為所有引用 `@/app/types/{user,trip,attraction,itinerary}` 的檔案更新 import path

確保前端對後端回傳資料有「執行期」的保護。

---

## 設計決策

### 1. `types/` 與 `schemas.ts` 的關係:**方案 C(Schema 為主)**

```
schemas.ts(新增,成為新的真相來源)
  ├── 用 z.object() 定義 schema
  └── 用 export type X = z.infer<typeof XSchema> 推導型別

types/(瘦身)
  ├── user.ts、trip.ts、attraction.ts、itinerary.ts  ← 刪除
  └── map.ts  ← 保留(內含 TravelMode、LegRouteState,純前端內部用)
```

**理由:**
- Schema 是「真相來源」,型別從 schema 推導,**永遠不會不同步**
- `types/` 不會完全消失,但會瘦身一大圈

### 2. `schemas.ts` 內部組織:**單檔分區段**

```
frontend/app/lib/schemas.ts

──── 區段 1:基礎 Schema(描述「一個東西」)────
UserSchema、export type User
TripPlaceSchema、export type TripPlace
ItineraryItemSchema、export type ItineraryItem
SharedItineraryItemSchema、export type SharedItineraryItem
AttractionSchema、export type Attraction
TripDataSchema、export type TripData
ItinerarySummaryRowSchema、export type ItinerarySummaryRow

──── 區段 2:端點 Schema(描述 API 怎麼包裝)────
MeResponseSchema = UserSchema.nullable()
TripDataListSchema = z.array(TripDataSchema)
TripPlaceListSchema = z.array(TripPlaceSchema)
ItineraryItemListSchema = z.array(ItineraryItemSchema)
ItinerarySummaryListSchema = z.array(ItinerarySummaryRowSchema)
CreateTripResSchema(獨立定義,無對應基礎)
SharedTripDataOutSchema(組合 trip + itinerary)
```

### 3. 範圍鎖死:**只做 #11 清單上的事**

- ✅ 一次完整搬遷所有 API 邊界型別到 schemas.ts(方案 C)
- ✅ 四個🔴呼叫端加 schema 驗證
- ✅ 🟡呼叫端補 `<void>` 泛型(只補型別,不加 schema)
- ✅ 8 個檔案僅更新 import path(不動業務邏輯)
- ❌ **不碰** `SearchResponse`(discriminated union,留待下一輪)
- ❌ **不加**欄位驗證(`.email()`、`.min()` 等),先讓 schema 跑起來、不破壞現狀
- ❌ **不驗** request body(只驗回傳),`apiPost` 的 payload 不加 schema 驗證
- ❌ **不碰** `useItineraryQueries.ts` 三個 apiGet(有 `normalizeArrayPayload` 需先設計討論 → 留給 #12)
- ❌ **不碰** `useEditData.ts` 內的 mutations(留給 #12)
- ❌ **不碰** `edit-workspace.tsx` 的 `apiGet<any>("/api/trips/${tid}")`(需新 schema,留給 #12)

### 4. Optional 欄位策略:**保守用 `.nullish()`**

後端 Pydantic 的 `Optional[str]` 可能輸出 `null` 也可能省略 key,前端統一用 `.nullish()` 同時接受兩種。

| Zod 寫法 | 接受 null | 接受 undefined |
|---|---|---|
| `z.string()` | ❌ | ❌ |
| `z.string().nullable()` | ✅ | ❌ |
| `z.string().optional()` | ❌ | ✅ |
| `z.string().nullish()` | ✅ | ✅ |

---

## 對象檔案清單

### 新增

- `frontend/app/lib/schemas.ts`

### 刪除(完成 schemas.ts 且 import path 全部更新後再刪)

- `frontend/app/types/user.ts`
- `frontend/app/types/trip.ts`
- `frontend/app/types/attraction.ts`
- `frontend/app/types/itinerary.ts`

### 保留

- `frontend/app/types/map.ts`(內含 `TravelMode`、`LegRouteState`,純前端)

### 修改類別 1(🔴 優先 - 加 schema 驗證 + 替換 import path)

這四個檔案目前都從 `@/app/types/...` import 型別,本次重構同時做兩件事:**替換 import 來源**,並**加上 schema 驗證**。

- `frontend/app/context/AuthContext.tsx`
- `frontend/app/hooks/useTrips.ts`
- `frontend/app/components/home/CreateTripModal.tsx`(內含本地 `type CreateTripRes`,要移除並改用 `schemas.ts` 的版本)
- `frontend/app/search/page.tsx`

### 修改類別 2(🟡 補 `<void>` 泛型 - 不加 schema)

- `frontend/app/context/AuthContext.tsx`(`apiPost("/api/logout")` - 同檔案,合併進類別 1 的修改)
- `frontend/app/components/layout/AuthCorner.tsx`(三個呼叫:`apiPost(endpoint, payload)` login/signup、`apiPatch(.../bind)`)
- `frontend/app/components/home/AddPlacesToTripBtn.tsx`(一個呼叫:`apiPost(.../places)`)

### 修改類別 3(僅更新 import path,不動業務邏輯)

刪除 `types/{user,trip,attraction,itinerary}.ts` 後,所有引用這些路徑的檔案都會編譯失敗。本次重構必須一併替換:

| 檔案 | 原 import | 新 import |
|---|---|---|
| `frontend/app/components/home/ExploreSection.tsx` | `from "@/app/types/trip"` | `from "@/app/lib/schemas"` |
| `frontend/app/components/home/ExploreTripCard.tsx` | `from "@/app/types/trip"` | `from "@/app/lib/schemas"` |
| `frontend/app/components/dashboard/TripCard.tsx` | `from "@/app/types/trip"` | `from "@/app/lib/schemas"` |
| `frontend/app/share/[token]/ShareWorkspace.tsx` | `from "@/app/types/trip"` | `from "@/app/lib/schemas"` |
| `frontend/app/components/search/ResultsSection.tsx` | `from "@/app/types/attraction"` | `from "@/app/lib/schemas"` |
| `frontend/app/components/search/AttractionCard.tsx` | `from "@/app/types/attraction"` | `from "@/app/lib/schemas"` |
| `frontend/app/hooks/useItineraryQueries.ts` | `from "@/app/types/trip"` 與 `from "@/app/types/itinerary"` | 全部改為 `from "@/app/lib/schemas"` |
| `frontend/app/hooks/useEditData.ts` | `from "@/app/types/trip"` 與 `from "@/app/types/itinerary"`(保留 `from "@/app/types/map"`) | API 邊界型別改為 `from "@/app/lib/schemas"`;`TravelMode` 維持從 `@/app/types/map` |
| `frontend/app/hooks/usePlaceThumbnails.ts` | `from "@/app/types/trip"` 與 `from "@/app/types/itinerary"` | 全部改為 `from "@/app/lib/schemas"` |
| `frontend/app/share/[token]/page.tsx`(若有引用) | `from "@/app/types/trip"` | `from "@/app/lib/schemas"` |

⚠️ **務必用 grep 找出所有引用點,不要單靠肉眼或上述表格**(以防遺漏):
```bash
grep -r "from \"@/app/types/user\"" frontend/ --exclude-dir=".next" --include="*.ts" --include="*.tsx"
grep -r "from \"@/app/types/trip\"" frontend/ --exclude-dir=".next" --include="*.ts" --include="*.tsx"
grep -r "from \"@/app/types/attraction\"" frontend/ --exclude-dir=".next" --include="*.ts" --include="*.tsx"
grep -r "from \"@/app/types/itinerary\"" frontend/ --exclude-dir=".next" --include="*.ts" --include="*.tsx"
grep -r "from \"@/app/types/all-types\"" frontend/ --exclude-dir=".next" --include="*.ts" --include="*.tsx"
```

執行完所有修改後,這 5 個 grep 應該都回傳空。

---

## Schema 對照表(後端 Pydantic → 前端 Zod)

### `UserSchema`(基礎)

對應後端 `schemas/auth.py` 的 `UserOut`,以及目前的 `frontend/app/types/user.ts`。

```
UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
})
```

### `TripDataSchema`(基礎)

對應 `/api/trips` 列表回傳的單筆,以及目前的 `frontend/app/types/trip.ts` 的 `TripData`。

```
TripDataSchema = z.object({
  trip_id: z.number(),
  title: z.string(),
  days: z.number(),
  start_date: z.string().nullable(),       // 原: string | null
  share_token: z.string().nullish(),       // 原: ?: string | null
  cover_url: z.string().nullish(),         // 原: ?: string | null
  first_place_id: z.string().nullish(),    // 原: ?: string | null
})
```

### `TripPlaceSchema`(基礎)

對應 `/api/trips/:id/places` 單筆,以及目前 `trip.ts` 的 `TripPlace`。

```
TripPlaceSchema = z.object({
  destination_id: z.number(),
  place_name: z.string().nullish(),
  city_name: z.string().nullish(),
  google_place_id: z.string(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
})
```

### `ItineraryItemSchema`(基礎)

對應 `/api/trips/:id/days/:day/itinerary` 單筆,以及目前 `itinerary.ts` 的 `ItineraryItem`。

```
ItineraryItemSchema = z.object({
  item_id: z.number(),
  trip_id: z.number(),
  day_index: z.number(),
  position: z.number(),
  destination_id: z.number(),
  place_name: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  google_place_id: z.string(),
  arrival_time: z.string().nullish(),
  departure_time: z.string().nullish(),
  travel_mode: z.string().nullish(),
  duration_millis: z.number().nullish(),
  distance_meters: z.number().nullish(),
})
```

### `ItinerarySummaryRowSchema`(基礎)

對應 `/api/trips/:id/itinerary/summary` 單筆。

```
ItinerarySummaryRowSchema = z.object({
  destination_id: z.number(),
  day_index: z.number(),
  position: z.number(),
  item_id: z.number(),
})
```

### `AttractionSchema`(基礎)

對應搜尋結果單筆,以及目前 `attraction.ts` 的 `Attraction`。注意 `AttractionImage` 原本就只是內部使用,**整合進來,不獨立 export**。

```
AttractionSchema = z.object({
  id: z.number(),
  attraction: z.string(),
  city: z.string(),
  description: z.string(),
  geo_tags: z.string(),
  images: z.array(z.object({
    url: z.string(),
    source: z.string(),
  })),
  google_place_id: z.string(),
  lat: z.number(),
  lng: z.number(),
})
```

### `SharedItineraryItemSchema`(基礎)

對應 `/api/share/:token` 內 itinerary 的單筆項目。注意欄位與 `ItineraryItemSchema` 略有不同(沒有 `trip_id`、`distance_meters`,`place_name` 必填)。

```
SharedItineraryItemSchema = z.object({
  item_id: z.number(),
  day_index: z.number(),
  position: z.number(),
  destination_id: z.number(),
  place_name: z.string(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  google_place_id: z.string().nullish(),
  arrival_time: z.string().nullish(),
  departure_time: z.string().nullish(),
  travel_mode: z.string().nullish(),
  duration_millis: z.number().nullish(),
})
```

### `SharedTripDataOutSchema`(端點 schema)

對應 `/api/share/:token` 完整回傳。

```
SharedTripDataOutSchema = z.object({
  trip: z.object({
    trip_id: z.number(),
    title: z.string(),
    days: z.number(),
    start_date: z.string().nullish(),
    user_id: z.number().nullish(),
  }),
  itinerary: z.record(z.string(), z.array(SharedItineraryItemSchema)),
  // ⚠️ 注意:這裡用 z.string() 不是 z.number()
  // JSON 物件的 key 一定是字串,前端原本就是字串 key
})
```

### `MeResponseSchema`(端點 schema)

```
MeResponseSchema = UserSchema.nullable()
// 對應 /api/me 後端 response_model=Optional[UserOut],未登入時回 null
```

### `CreateTripResSchema`(端點 schema,無對應基礎)

對應 `POST /api/trips` 的回傳。

```
CreateTripResSchema = z.object({
  trip_id: z.number(),
  edit_token: z.string(),
})
```

### 各種陣列 Schema(端點 schema)

```
TripDataListSchema = z.array(TripDataSchema)
TripPlaceListSchema = z.array(TripPlaceSchema)
ItineraryItemListSchema = z.array(ItineraryItemSchema)
ItinerarySummaryListSchema = z.array(ItinerarySummaryRowSchema)
```

⚠️ `ItineraryItemListSchema` 與 `ItinerarySummaryListSchema` 本次重構**沒有呼叫端使用**(因為 `useItineraryQueries` 留給 #12),但仍然定義出來,讓 schemas.ts 自身完整,#12 直接用即可。

---

## 呼叫端改動清單

### 🔴 優先(回傳值直接進 UI,加 schema 驗證)

#### 1. `frontend/app/context/AuthContext.tsx`

**現況(develop):**
```ts
import type { User } from "@/app/types/user";
// ...
const data = await apiGet<User>("/api/me");
```

**改成:**
```ts
import { type User, MeResponseSchema } from "@/app/lib/schemas";
// ...
const data = await apiGet("/api/me", { schema: MeResponseSchema });
// data 的型別自動推導為 User | null,不需手動寫泛型
```

**順便說明:** 原本 `checkAuth` 的 try/catch 沒有真的區分「未登入」跟「伺服器錯誤」(因為後端未登入時回 200 + null,不會走 catch),這次重構**不改動邏輯**,只把 schema 接上。邏輯上會等價,但型別會更精準(`data: User | null`)。

#### 2. `frontend/app/hooks/useTrips.ts`

**現況(develop):**
```ts
import type { TripData } from "@/app/types/trip";
// ...
queryFn: () => apiGet<TripData[]>("/api/trips"),
```

**改成:**
```ts
import { type TripData, TripDataListSchema } from "@/app/lib/schemas";
// ...
queryFn: () => apiGet("/api/trips", { schema: TripDataListSchema }),
```

#### 3. `frontend/app/components/home/CreateTripModal.tsx`

**現況(develop):**
```ts
// 檔案內有本地定義:
type CreateTripRes = { trip_id: number; edit_token: string };
// ...
const out = await apiPost<CreateTripRes>("/api/trips", payload);
```

**改成:**
```ts
// 1. 移除檔案內的 `type CreateTripRes = ...` 這一行
// 2. 從 schemas import:
import { CreateTripResSchema } from "@/app/lib/schemas";
// ...
const out = await apiPost("/api/trips", payload, { schema: CreateTripResSchema });
// out 自動推導為 { trip_id: number; edit_token: string }
```

⚠️ **注意 `apiPost` 的參數順序**:`apiPost(url, body, options)`,schema 在第三個參數 options 裡。

#### 4. `frontend/app/search/page.tsx`

**現況(develop):**
```ts
const activeTripPlacesQ = useQuery({
  queryKey: ["activeTripPlaces", activeTripId],
  enabled: activeTripId !== null,
  queryFn: async () => apiGet<any[]>(`/api/trips/${activeTripId}/places`),
});

const scheduledIds = useMemo(() => {
  const set = new Set<string>();
  if (activeTripPlacesQ.data) {
    activeTripPlacesQ.data.forEach((p: any) => {
      if (p.google_place_id) set.add(p.google_place_id);
    });
  }
  return set;
}, [activeTripPlacesQ.data]);
```

**改成:**
```ts
import { TripPlaceListSchema } from "@/app/lib/schemas";
// ...
const activeTripPlacesQ = useQuery({
  queryKey: ["activeTripPlaces", activeTripId],
  enabled: activeTripId !== null,
  queryFn: async () => apiGet(`/api/trips/${activeTripId}/places`, { schema: TripPlaceListSchema }),
});

const scheduledIds = useMemo(() => {
  const set = new Set<string>();
  if (activeTripPlacesQ.data) {
    activeTripPlacesQ.data.forEach((p) => {  // 移除 (p: any),自動推導為 TripPlace
      if (p.google_place_id) set.add(p.google_place_id);
    });
  }
  return set;
}, [activeTripPlacesQ.data]);
```

⚠️ 同時記得確認此檔案的 `import type { Attraction }` 是否還需要(目前看是有用到 `useState<Attraction[]>`),需更新 import path 為 `@/app/lib/schemas`。

### 🟡 補 `<void>` 泛型(不加 schema)

#### 5. `frontend/app/context/AuthContext.tsx` 的 `apiPost("/api/logout")`

```ts
// 改成
await apiPost<void>("/api/logout");
```

#### 6. `frontend/app/components/layout/AuthCorner.tsx`

```ts
// 三處全部補 <void>:
await apiPost<void>(endpoint, payload);  // 登入/註冊
// ...
await apiPatch<void>(`/api/trips/${trip.trip_id}/bind`);
```

#### 7. `frontend/app/components/home/AddPlacesToTripBtn.tsx`

```ts
// 改成
apiPost<void>(`/api/trips/${activeTripId}/places`, { google_place_id: gpid })
```

### 僅更新 import path(不動業務邏輯)

清單見上方「修改類別 3」表格。**這幾個檔案的目標只有一個:讓 TypeScript 編譯通過**。型別內容、變數命名、業務邏輯完全不變。

#### 範例:`ExploreSection.tsx`

```ts
// 現況
import type { TripData } from "@/app/types/trip";

// 改成
import type { TripData } from "@/app/lib/schemas";
```

#### 特殊:`useEditData.ts`

`useEditData.ts` 目前 import 三個 type 路徑:
```ts
import type { TripPlace } from "@/app/types/trip";
import type { ItineraryItem } from "@/app/types/itinerary";
import type { TravelMode } from "@/app/types/map";
```

改為:
```ts
import type { TripPlace, ItineraryItem } from "@/app/lib/schemas";
import type { TravelMode } from "@/app/types/map";  // ⚠️ 這行保持不變!
```

**`TravelMode` 屬於純前端內部型別,留在 `types/map.ts` 不搬。**

### 不在本次重構範圍(留給 #12)

| 檔案 | 呼叫 | 為何留給 #12 |
|---|---|---|
| `useItineraryQueries.ts` | 三個 `apiGet` 包著 `normalizeArrayPayload` | 需先決定 `normalizeArrayPayload` 的命運 |
| `useEditData.ts` | `apiPost<ItineraryItem>(.../itinerary)`、`apiPost(.../places)`、`apiDelete(.../places/:id)` 等 mutations | 不在原 #11 範圍,獨立處理 |
| `edit-workspace.tsx` | `apiGet<any>(\`/api/trips/${tid}\`)` | 需新增 `TripDetailSchema`(對應後端 `TripOut`),欄位與 `TripDataSchema` 不同 |
| 任何 `SearchResponse` 相關 | discriminated union 較複雜 | 留待下一輪 |

→ 重要:**這些檔案如果只是「import path 需要更新」**(例如 `useItineraryQueries.ts` import 了 `TripPlace`、`ItineraryItem`),**仍然要在本次重構更新 import path**。
**只有「為呼叫端加 schema」這件事留給 #12。**

---

## 預期成果

### Schema 檔案結構

```
frontend/app/lib/schemas.ts(約 150-180 行)
  ├── 區段 1:7 個基礎 Schema + 7 個 type 推導
  └── 區段 2:9 個端點 Schema(含陣列)
```

### types/ 資料夾

```
frontend/app/types/
  └── map.ts   (僅剩這個)
```

### 呼叫端

| 檔案 | 變更摘要 |
|---|---|
| `AuthContext.tsx` | import path 更新;`/api/me` 加 schema;`/api/logout` 補 `<void>` |
| `useTrips.ts` | import path 更新;`/api/trips` 加 schema |
| `CreateTripModal.tsx` | 移除本地 `CreateTripRes` type;`POST /api/trips` 加 schema |
| `search/page.tsx` | import path 更新;`activeTripPlacesQ` 加 schema;移除 `any[]`、`(p: any)` |
| `AuthCorner.tsx` | 三個呼叫補 `<void>` |
| `AddPlacesToTripBtn.tsx` | 一個呼叫補 `<void>` |
| 其他 8 個檔案 | 僅 import path 更新 |

### 驗證標準

1. **TypeScript 編譯通過**:`cd frontend && npx tsc --noEmit` 無錯誤
2. **舊路徑無殘留**:5 個 grep 指令全部回傳空
3. **功能不破壞**:Docker 起來後手動測試
   - 登入/登出
   - 首頁載入(行程列表)
   - 建立新行程
   - 進入搜尋頁(`/search?location=台北`)
   - 分享頁(`/share/:token`)
   - **編輯頁(`/edit/:tripId`)** ← 這頁有最多檔案改了 import,務必測

---

## 注意事項

### 1. Schema 編寫陷阱

- `z.string().nullable()` 接受 `null` 但**不接受** `undefined`
- `z.string().optional()` 接受 `undefined` 但**不接受** `null`
- 後端不確定哪種時用 `.nullish()`(這次預設策略)
- **欄位順序不影響驗證**,但寫法要與後端對齊,方便對照

### 2. Schema 定義順序

寫 schemas.ts 時注意**基礎 schema 先定義、端點 schema 後定義**,因為端點會引用基礎。例如:

```ts
// ❌ 錯誤順序:會 ReferenceError
const TripDataListSchema = z.array(TripDataSchema);  // ← TripDataSchema 還沒定義
const TripDataSchema = z.object({ ... });

// ✅ 正確順序
const TripDataSchema = z.object({ ... });
const TripDataListSchema = z.array(TripDataSchema);
```

### 3. `apiPost` 的 schema 參數位置

```ts
// apiGet:url 後直接接 options
apiGet("/api/me", { schema: MeResponseSchema })

// apiPost:url、body、options 三個參數
apiPost("/api/trips", payload, { schema: CreateTripResSchema })
//      ^^^^^^^^^^^^ ^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//      url          body    options(schema 在這裡)
```

### 4. 條件型別自動推導

有傳 schema 就**不需手動寫泛型**:

```ts
// ❌ 重複(資訊說兩次)
apiGet<User>("/api/me", { schema: MeResponseSchema })

// ✅ 自動推導(回傳型別自動為 User | null)
apiGet("/api/me", { schema: MeResponseSchema })
```

### 5. 變更 import 後務必跑 grep 驗證

VS Code 預設搜尋會排除 `.next/`,但 build 後檔案可能還引用舊路徑。**必須用 grep 驗證**(指令見上文「修改類別 3」)。

### 6. Zod 套件版本

確認 `frontend/package.json` 已安裝 `zod`(重構 #7 時應已安裝)。若無需重新 `npm install zod`。

### 7. import 寫法統一

新版 schemas.ts 同時 export 型別與 schema,推薦的 import 風格:

```ts
// ✅ 一次 import 型別與 schema
import { type User, UserSchema, MeResponseSchema } from "@/app/lib/schemas";

// 也可以分開
import type { User } from "@/app/lib/schemas";
import { UserSchema, MeResponseSchema } from "@/app/lib/schemas";
```

兩種都接受,**只要這個檔案內保持一致**即可。

---

## 執行順序建議

依照「依賴關係」由內到外:

1. **建立 `frontend/app/lib/schemas.ts`**,寫入所有 schema 與型別推導
2. **依「修改類別 3」表格,更新所有 import path**(僅換路徑,不動邏輯)
   - 此時就可以跑 `npx tsc --noEmit`,還會有錯(因為原 types/ 檔案還在,但這些檔案的 import 已切到 schemas.ts),這正常,繼續
3. **修改🔴四個呼叫端**:套用 schema、移除本地 type 定義
4. **修改🟡呼叫端**:補 `<void>` 泛型
5. **grep 驗證**:確認 `@/app/types/{user,trip,attraction,itinerary,all-types}` 都沒有殘留
6. **刪除 `types/` 內的舊檔案**:`user.ts`、`trip.ts`、`attraction.ts`、`itinerary.ts`
7. **再跑一次 `npx tsc --noEmit`**:確認 TypeScript 編譯通過
8. **Docker 起來手動測試**:依驗證標準逐項確認

---

## 完成後請更新

完成所有改動後,回到 `frontend_refactor_checklist.md` 將「重構 #11」標記為 ✅ 與完成日期,並在「主要學到的東西」記錄本次心得。

---

## ✅ 執行摘要（2026-05-22 完成）

### 與 Spec 的差異

**Spec 未預期、執行 grep 後額外發現的引用檔案（全部一併更新 import path）：**

| 檔案 | 引用的舊路徑 |
|---|---|
| `components/edit/PlacePoolPanel.tsx` | `@/app/types/trip`、`@/app/types/itinerary` |
| `components/edit/TripMap.tsx` | `@/app/types/trip`、`@/app/types/itinerary` |
| `components/edit/DailyItineraryPanel.tsx` | `@/app/types/itinerary` |
| `components/share/DayScheduleCard.tsx` | `@/app/types/itinerary` |
| `hooks/useRouteCalculator.ts` | `@/app/types/itinerary`、`@/app/types/trip` |
| `hooks/useDraftState.ts` | `@/app/types/itinerary` |
| `lib/edit/itinerary-route-leg.ts` | `@/app/types/trip` |

這 7 個檔案只更新 import path，業務邏輯完全不動，符合「修改類別 3」原則。

### `.nullish()` 型別漣漪與修正

舊型別用 `?:` 表達可選（`string | undefined`），新 schema 改用 `.nullish()`（`string | null | undefined`）。傳給只接受 `string | undefined` 的 props 或函式時，TypeScript 報錯。

**修正位置與方式：**

```tsx
// PlacePoolPanel.tsx（TripPlace.place_name）
alt={p.place_name ?? undefined}
onClick={() => onUpdatePreview(p.google_place_id, p.place_name ?? undefined)}

// DailyItineraryPanel.tsx（ItineraryItem.place_name）
alt={it.place_name ?? undefined}
onClick={() => onUpdatePreview(it.google_place_id, it.place_name ?? undefined)}
```

`?? undefined` 的作用：將 `string | null | undefined` 收窄回 `string | undefined`，`null` 轉換為 `undefined`，符合下游函式的型別期望。

### 最終驗證結果

**grep 驗證（5 個指令全部回傳空）：**
```
@/app/types/user      → 無殘留
@/app/types/trip      → 無殘留
@/app/types/attraction → 無殘留
@/app/types/itinerary  → 無殘留
@/app/types/all-types  → 無殘留
```

**`npx tsc --noEmit`：** 所有業務相關型別錯誤已修復。唯一殘留錯誤為 `.next/dev/types/validator.ts` 找不到 `test-image/page.js`，這是重構前即存在的 `.next` 快取殘留，與本次重構無關。

**`types/` 資料夾最終狀態：**
```
frontend/app/types/
  └── map.ts   ← 唯一保留（TravelMode、LegRouteState，純前端內部用）
```
