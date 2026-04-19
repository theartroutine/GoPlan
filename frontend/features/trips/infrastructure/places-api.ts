export type PlaceSuggestion = {
  place_id: string;
  main_text: string;
  secondary_text: string;
};

export type PlaceDetails = {
  place_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  country_code: string;
  photo_reference: string;
};

type AutocompleteResponse = { suggestions: PlaceSuggestion[] };

export async function bffAutocompletePlaces(
  query: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  try {
    const res = await fetch("/api/places/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: query, sessionToken }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as AutocompleteResponse;
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function bffGetPlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  try {
    const params = new URLSearchParams({ place_id: placeId, session_token: sessionToken });
    const res = await fetch(`/api/places/details?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as PlaceDetails;
  } catch {
    return null;
  }
}

export function getPlacePhotoUrl(photoReference: string, maxwidth = 800): string {
  const params = new URLSearchParams({ ref: photoReference, maxwidth: String(maxwidth) });
  return `/api/places/photo?${params.toString()}`;
}
