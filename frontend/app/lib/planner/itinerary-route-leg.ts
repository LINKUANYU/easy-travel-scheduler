import type { TravelMode, TripPlace } from "@/app/types/all-types";
import { loadRoutesLibrary } from "../googleMapsLoader";


export type SimpleComputeRoutesRequest = {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  travelMode: TravelMode;
  fields: string[];
  routingPreference?: string;
  departureTime?: Date;
};

type SimpleRoutesLibrary = {
  Route: {
    computeRoutes: (
      request: SimpleComputeRoutesRequest
    ) => Promise<{
      routes?: Array<{
        durationMillis?: number;
        distanceMeters?: number;
      }>;
    }>;
  };
};

// 這個是在幫每一段交通做唯一 key。
export function makeLegKey(fromItemId: number, toItemId: number){
  return `${fromItemId}-${toItemId}`;
}
// 防呆檢查資料裡確實有lat、lng，return boolean，Pick(TripPlace中只選"lat"、"lng")
export function hasLatLng(place?: Pick<TripPlace, "lat" | "lng"> | null): place is { lat: number, lng: number} {
  return typeof place?.lat === "number" && typeof place?.lng === "number";
}
// 轉換時間樣式
export function formatDuration(ms?: number){
  if (typeof ms !== "number") return "--";
  const totalMin = Math.round(ms / 60000);  // 四捨五入
  const h = Math.floor(totalMin / 60);  // 無條件捨去
  const m = totalMin % 60;
  return h > 0? ` ${h} 小時 ${m} 分` : ` ${m} 分`
}
// 轉換距離樣式
export function formatDistance(meters?: number) {
  if (typeof meters !== "number") return "--";
  if (meters >= 1000) {
    const km = meters / 1000;
    return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

// 送出Route API 計算距離
export async function computeLegRoute(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  mode: TravelMode;
}) {

  const routesLib = (await loadRoutesLibrary()) as unknown as SimpleRoutesLibrary;
  const { Route } = routesLib;

  const request: SimpleComputeRoutesRequest = {
    origin: { lat: args.from.lat, lng: args.from.lng },
    destination: { lat: args.to.lat, lng: args.to.lng },
    travelMode: args.mode,
    fields: ["durationMillis", "distanceMeters"],
  };

  if (args.mode === "DRIVING") {
    request.routingPreference = "TRAFFIC_UNAWARE";  // 不考慮即時路況
  }

  if (args.mode === "TRANSIT") {
    request.departureTime = new Date();
  }

  const { routes } = await Route.computeRoutes(request);
  const route = routes?.[0];

  if (!route) {
    throw new Error("查無路線");
  }

  return {
    durationMillis: route.durationMillis,
    distanceMeters: route.distanceMeters,
  };
}
