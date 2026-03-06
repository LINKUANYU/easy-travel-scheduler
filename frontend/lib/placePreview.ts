// lib/getPlaceDetails.ts

import { loadPlacesLibrary } from "@/lib/googleMapsLoader";

export type PlacePreview = {
  id: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  photoUrls: string[];
  googleMapsURI?: string;
  websiteURI?: string;
};

// place api 回來的lat、lng資料會是方法，所以先用一層function去讀值
function latOf(loc: any): number | undefined {
  if (!loc) return undefined;
  return typeof loc.lat === "function" ? loc.lat() : loc.lat; // 如果是方法就用.lat()去讀，如果是屬性就直接讀
}
function lngOf(loc: any): number | undefined {
  if (!loc) return undefined;
  return typeof loc.lng === "function" ? loc.lng() : loc.lng;
}

export async function fetchPlacePreview(placeId: string): Promise<PlacePreview> {
  // 確保 places library 已載入（你的 loader 會做 key 設定與 importLibrary）
  // Google 定義好的功能規則 class （類別）
  const { Place } = (await loadPlacesLibrary()) as any;

  // 照著那個class 型別，把id傳進去後存起來變成 Instance (實例 / 物件)
  const place = new Place({ id: placeId });

  // 在這裡才去跟google 要資料，用 fetchFields 取你要的欄位
  await place.fetchFields({
    fields: [
      "displayName",
      "formattedAddress",
      "location",
      "photos",
      "googleMapsURI",
      "websiteURI",
    ],
  });

  const photoUrls =
    (place.photos ?? []).slice(0, 3).map((ph: any) => ph.getURI());
    /** 原本的 ph (Photo 物件) 長相：
    它是一個複雜的物件，裡面包含：authorAttributions（攝影者名稱）、height、width 等，但它不是網址。
    執行 getURI() 後：
    它會根據 Google 的規則生成一串長長的加密網址。
    */
  return {
    id: placeId,
    name: place.displayName,
    address: place.formattedAddress,
    lat: latOf(place.location),
    lng: lngOf(place.location),
    photoUrls,
    googleMapsURI: place.googleMapsURI,
    websiteURI: place.websiteURI,
  };
}