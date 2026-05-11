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
  arrival_time?: string | null;
  departure_time?: string | null;
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
};
