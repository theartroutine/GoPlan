import axios from "axios";

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

export class LocationSearchError extends Error {
  readonly status?: number;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "LocationSearchError";
    this.status = options.status;
  }
}

function extractErrorDetail(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const detail = (data as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.length > 0 ? detail : null;
}

function toLocationSearchError(error: unknown, fallback: string): LocationSearchError {
  if (axios.isAxiosError(error)) {
    return new LocationSearchError(
      extractErrorDetail(error.response?.data) ?? fallback,
      { status: error.response?.status },
    );
  }

  if (error instanceof Error && error.message.length > 0) {
    return new LocationSearchError(error.message);
  }

  return new LocationSearchError(fallback);
}

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
  } catch (error) {
    throw toLocationSearchError(error, "Location search is unavailable.");
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
