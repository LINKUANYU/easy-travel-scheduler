import { z } from "zod";

// ════════════════════════════════════════════════════════════════════════════
// 區段 1：基礎 Schema（Base Schemas）
// 每個 Schema 對應後端 Pydantic 回傳的一種資料結構（Data Model）
// 透過 z.infer 自動推導 TypeScript 型別，確保前後端資料契約一致
// ════════════════════════════════════════════════════════════════════════════

// 使用者資料，對應後端 UserOut
// 定義資料驗證器（Schema）建立一個 Zod 驗證物件
export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
});
// 請 Zod 幫我自動產生對應的 TypeScript 型別，而不用手動重複寫一次。
export type User = z.infer<typeof UserSchema>;

// 行程摘要資料，對應 GET /api/trips 列表回傳
export const TripDataSchema = z.object({
  trip_id: z.number(),
  title: z.string(),
  days: z.number(),
  start_date: z.string().nullable(),
  share_token: z.string().nullish(),
  cover_url: z.string().nullish(),
  first_place_id: z.string().nullish(),
});
export type TripData = z.infer<typeof TripDataSchema>;

// 行程景點（Place）資料，對應 GET /api/trips/:id/places 回傳
export const TripPlaceSchema = z.object({
  destination_id: z.number(),
  place_name: z.string().nullish(),
  city_name: z.string().nullish(),
  google_place_id: z.string(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});
export type TripPlace = z.infer<typeof TripPlaceSchema>;

// 行程日曆條目，對應 GET /api/trips/:id/days/:day/itinerary 回傳
export const ItineraryItemSchema = z.object({
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
});
export type ItineraryItem = z.infer<typeof ItineraryItemSchema>;

// 行程摘要列（Summary Row），對應 GET /api/trips/:id/itinerary/summary 回傳
export const ItinerarySummaryRowSchema = z.object({
  destination_id: z.number(),
  day_index: z.number(),
  position: z.number(),
  item_id: z.number(),
});
export type ItinerarySummaryRow = z.infer<typeof ItinerarySummaryRowSchema>;

// 景點搜尋結果，對應搜尋 API 回傳的單一景點資料
// AttractionImage 僅內部使用，不另外 export
export const AttractionSchema = z.object({
  id: z.number(),
  attraction: z.string(),
  city: z.string(),
  description: z.string(),
  geo_tags: z.string(),
  images: z.array(
    z.object({
      url: z.string(),
      source: z.string(),
    })
  ),
  google_place_id: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type Attraction = z.infer<typeof AttractionSchema>;

// 分享頁行程條目，對應 GET /api/share/:token 內的 itinerary 項目
// 欄位與 ItineraryItemSchema 略有不同（無 trip_id、distance_meters，place_name 必填）
export const SharedItineraryItemSchema = z.object({
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
});
export type SharedItineraryItem = z.infer<typeof SharedItineraryItemSchema>;

// ════════════════════════════════════════════════════════════════════════════
// 區段 2：端點 Schema（Endpoint Schemas）
// 對應各 API 端點的完整回傳結構，部分是基礎 Schema 的陣列或組合
// ════════════════════════════════════════════════════════════════════════════

// GET /api/me：未登入時後端回傳 null，登入時回傳 UserSchema
export const MeResponseSchema = UserSchema.nullable();

// GET /api/trips：回傳行程列表
export const TripDataListSchema = z.array(TripDataSchema);

// GET /api/trips/:id/places：回傳景點列表
export const TripPlaceListSchema = z.array(TripPlaceSchema);

// GET /api/trips/:id/days/:day/itinerary：回傳當日行程條目列表
export const ItineraryItemListSchema = z.array(ItineraryItemSchema);

// GET /api/trips/:id/itinerary/summary：回傳摘要列表
export const ItinerarySummaryListSchema = z.array(ItinerarySummaryRowSchema);

// POST /api/trips：建立行程，回傳新行程 ID 與編輯 Token
export const CreateTripResSchema = z.object({
  trip_id: z.number(),
  edit_token: z.string(),
});

// GET /api/share/:token：分享頁完整資料（行程 + 行程表）
// 注意：itinerary 的 key 是 JSON 字串，不是數字
export const SharedTripDataOutSchema = z.object({
  trip: z.object({
    trip_id: z.number(),
    title: z.string(),
    days: z.number(),
    start_date: z.string().nullish(),
    user_id: z.number().nullish(),
  }),
  itinerary: z.record(z.string(), z.array(SharedItineraryItemSchema)),
});
export type SharedTripDataOut = z.infer<typeof SharedTripDataOutSchema>;
