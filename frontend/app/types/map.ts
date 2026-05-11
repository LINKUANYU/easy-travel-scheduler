export type TravelMode = "DRIVING" | "WALKING" | "TRANSIT";

export type LegRouteState = {
  mode: TravelMode;
  fromItemId: number;
  toItemId: number;
  durationMillis?: number;
  distanceMeters?: number;
  loading?: boolean;
  error?: string;
};
