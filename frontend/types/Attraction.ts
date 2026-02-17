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
  lat: number
  lng: number
}
