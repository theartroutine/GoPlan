import { NextRequest, NextResponse } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";
import {
  consumeHereLocationSearchSlot,
  getHereLocationSearchAvailability,
  getHereLocationSearchFetchTimeoutMs,
  getHereLocationSearchSuggestCacheTtlMs,
  readHereLocationSearchCache,
  writeHereLocationSearchCache,
} from "@/app/api/location-search/_lib/here-location-guard";

const HERE_API_KEY = process.env.HERE_API_KEY;
const HERE_AUTOSUGGEST_URL = "https://geocode.search.hereapi.com/v1/autosuggest";
const VIETNAM_BIAS_AT = "16.047079,108.206230";
const MAX_QUERY_LENGTH = 120;

type HereSuggestItem = {
  id?: string;
  title?: string;
  resultType?: string;
  address?: {
    label?: string;
  };
};

type HereSuggestResponse = {
  items?: HereSuggestItem[];
};

function buildSubtitle(item: HereSuggestItem): string {
  const label = item.address?.label ?? "";
  const title = item.title ?? "";
  if (!label) return "";
  if (title && label.startsWith(title)) {
    return label.slice(title.length).replace(/^,\s*/, "");
  }
  return label;
}

function getResultTypeRank(item: HereSuggestItem): number {
  switch (item.resultType) {
    case "locality":
      return 0;
    case "administrativeArea":
      return 1;
    case "country":
      return 2;
    case "street":
      return 3;
    case "houseNumber":
      return 4;
    case "place":
      return 5;
    default:
      return 6;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getAuthenticatedUserId(data: unknown): string | null {
  const payload = asObject(data);
  const user = asObject(payload?.user);
  const id = user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function fetchHere(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getHereLocationSearchFetchTimeoutMs(),
  );

  try {
    return await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const availability = getHereLocationSearchAvailability();
  if (!availability.enabled) {
    return NextResponse.json({ detail: availability.detail }, { status: 503 });
  }
  const hereApiKey = HERE_API_KEY;
  if (!hereApiKey) {
    return NextResponse.json({ detail: "Location search is not configured." }, { status: 503 });
  }

  const authResult = await protectedUpstreamCall({
    path: "/api/auth/me",
    method: "GET",
    authorization: request.headers.get("Authorization"),
  });
  if (!authResult.ok) {
    return authResult.response;
  }
  const userId = getAuthenticatedUserId(authResult.data);
  if (!userId) {
    return buildProtectedResponse(
      { detail: "Invalid authenticated user payload." },
      authResult.refreshedAccessToken,
      502,
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return buildProtectedResponse({ suggestions: [] }, authResult.refreshedAccessToken);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return buildProtectedResponse(
      { detail: "Search query is too long." },
      authResult.refreshedAccessToken,
      400,
    );
  }

  const cacheKey = `suggest:${query.toLocaleLowerCase("vi-VN")}`;
  const cachedSuggestions = readHereLocationSearchCache<
    {
      provider: "here";
      provider_id: string;
      subtitle: string;
      title: string;
    }[]
  >({ key: cacheKey });

  if (cachedSuggestions) {
    return buildProtectedResponse(
      { suggestions: cachedSuggestions },
      authResult.refreshedAccessToken,
    );
  }

  const rateLimit = consumeHereLocationSearchSlot({ bucketKey: userId });
  if (!rateLimit.allowed) {
    const response = buildProtectedResponse(
      { detail: "HERE location search is temporarily rate limited." },
      authResult.refreshedAccessToken,
      429,
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
  }

  const url = new URL(HERE_AUTOSUGGEST_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("apiKey", hereApiKey);
  url.searchParams.set("lang", "vi-VN");
  url.searchParams.set("politicalView", "VNM");
  // HERE autosuggest requires a spatial bias. Use Vietnam as the default bias
  // so local searches behave well while still allowing global results.
  url.searchParams.set("at", VIETNAM_BIAS_AT);
  url.searchParams.set("limit", "8");

  try {
    const res = await fetchHere(url);
    if (!res.ok) {
      return buildProtectedResponse(
        { detail: "Location service unavailable." },
        authResult.refreshedAccessToken,
        502,
      );
    }

    const data = (await res.json()) as HereSuggestResponse;
    const suggestions = (data.items ?? [])
      .sort((left, right) => getResultTypeRank(left) - getResultTypeRank(right))
      .map((item) => ({
        provider: "here" as const,
        provider_id: item.id ?? "",
        title: item.title ?? "",
        subtitle: buildSubtitle(item),
      }))
      .filter((item) => item.provider_id.length > 0 && item.title.length > 0);

    writeHereLocationSearchCache({
      key: cacheKey,
      ttlMs: getHereLocationSearchSuggestCacheTtlMs(),
      value: suggestions,
    });

    return buildProtectedResponse({ suggestions }, authResult.refreshedAccessToken);
  } catch {
    return buildProtectedResponse(
      { detail: "Failed to fetch suggestions." },
      authResult.refreshedAccessToken,
      502,
    );
  }
}
