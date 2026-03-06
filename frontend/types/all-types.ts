export interface AttractionImage {
  url: string
  source: string
}

export interface Attraction {
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

export interface TripPlace {
  destination_id: number;
  place_name?: string;
  city_name?: string;
  google_place_id: string;
  lat?: number | null;
  lng?: number | null;
  // 你後端如果有 photos/cover 也可加上來
};

export interface ItineraryItem {
  item_id: number;
  trip_id: number;
  day_index: number;
  position: number;
  destination_id: number;
  place_name?: string;
  lat?: number | null;
  lng?: number | null;
  google_place_id: string;
};

export interface ItinerarySummaryRow {
  destination_id: number;
  day_index: number;
  position: number;
  item_id: number;
};