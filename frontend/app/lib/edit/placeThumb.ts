import { loadPlacesLibrary } from "../googleMapsLoader";

export type PlaceThumb = {
  url?: string;
  authorAttributions?: Array<{
    displayName?: string;
    uri?: string;
    photoURI?: string
  }>;
};


export async function fetchPlaceThumb(placeId: string): Promise<PlaceThumb> {
  const {Place} = (await loadPlacesLibrary()) as any;  // 拿到型別Place(工具)
  const place = new Place({id: placeId});  // 以型別Place 設定要的id

  await place.fetchFields({  // 發送請求
    fields: ["photos"],
  });

  const photo = place.photos?.[0]

  return {
    url: photo?.getURI({maxHeight: 400, maxWidth: 400}),
    authorAttributions: photo?.authorAttributions ?? [],
  };

};