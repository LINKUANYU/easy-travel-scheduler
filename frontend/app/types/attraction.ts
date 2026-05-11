type AttractionImage = {
  url: string;
  source: string;
};

export type Attraction = {
  id: number;
  attraction: string;
  city: string;
  description: string;
  geo_tags: string;
  images: AttractionImage[];
  google_place_id: string;
  lat: number;
  lng: number;
};
