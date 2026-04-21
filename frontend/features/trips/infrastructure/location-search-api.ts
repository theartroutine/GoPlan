export type LocationSuggestion = {
  provider: "here";
  provider_id: string;
  title: string;
  subtitle: string;
};

export type ResolvedDestination = {
  destination: string;
  destination_provider: "here";
  destination_provider_id: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country_code: string;
};

type SuggestResponse = { suggestions: LocationSuggestion[] };

export async function bffSuggestLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  try {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`/api/location-search/suggest?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as SuggestResponse;
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function bffLookupLocation(providerId: string): Promise<ResolvedDestination | null> {
  try {
    const params = new URLSearchParams({ id: providerId });
    const res = await fetch(`/api/location-search/lookup?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as ResolvedDestination;
  } catch {
    return null;
  }
}
