import type { SharedItineraryItem } from "./itinerary";

export type TripData = {
  trip_id: number;
  title: string;
  days: number;
  start_date: string | null;
  share_token?: string | null;
  cover_url?: string | null;
  first_place_id?: string | null;
};

export type TripPlace = {
  destination_id: number;
  place_name?: string;
  city_name?: string;
  google_place_id: string;
  lat?: number | null;
  lng?: number | null;
};

export type SharedTripDataOut = {
  trip: {
    trip_id: number;
    title: string;
    days: number;
    start_date?: string;
    user_id?: number;
  };
  itinerary: Record<number, SharedItineraryItem[]>;
};
