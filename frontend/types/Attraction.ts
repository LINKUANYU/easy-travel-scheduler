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
