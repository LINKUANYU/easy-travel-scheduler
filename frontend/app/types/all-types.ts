export type AttractionImage = {
  url: string
  source: string
}

export type Attraction = {
  id: number
  attraction: string
  city: string
  description: string
  geo_tags: string
  images: AttractionImage[]
  google_place_id: string
  lat: number
  lng: number
}

export type TripPlace = {
  destination_id: number;
  place_name?: string;
  city_name?: string;
  google_place_id: string;
  lat?: number | null;
  lng?: number | null;
  // 你後端如果有 photos/cover 也可加上來
};

export type ItineraryItem = {
  item_id: number;
  trip_id: number;
  day_index: number;
  position: number;
  destination_id: number;
  place_name?: string;
  lat?: number | null;
  lng?: number | null;
  google_place_id: string;
  arrival_time?: string | null
  departure_time?: string | null
  travel_mode?: string | null;
  duration_millis?: number | null;
  distance_meters?: number | null;
};

export type ItinerarySummaryRow = {
  destination_id: number;
  day_index: number;
  position: number;
  item_id: number;
};

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

export type SharedItineraryItem = {
  item_id: number;
  day_index: number;
  position: number;
  destination_id: number;
  place_name: string;
  lat?: number;
  lng?: number;
  google_place_id?: string;
  arrival_time?: string;
  departure_time?: string;
  travel_mode?: string;
  duration_millis?: number;
}


export type SharedTripDataOut = {
  trip: {
    trip_id: number;
    title: string;
    days: number;
    start_date?: string;
    user_id?: number;
  };
  itinerary: Record<number, SharedItineraryItem[]>;
}