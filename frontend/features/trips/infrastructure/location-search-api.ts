import { bff } from "@/shared/http/bff-client";

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
    const res = await bff.get<SuggestResponse>("/api/location-search/suggest", {
      params: { q: query },
      signal,
    });
    const data = res.data;
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

export async function bffLookupLocation(
  providerId: string,
  signal?: AbortSignal,
): Promise<ResolvedDestination | null> {
  try {
    const res = await bff.get<ResolvedDestination>("/api/location-search/lookup", {
      params: { id: providerId },
      signal,
    });
    return res.data;
  } catch {
    return null;
  }
}
