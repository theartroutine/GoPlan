import { NextRequest, NextResponse } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";
import { normalizeCountryCode } from "@/app/api/location-search/_lib/country-codes";
import {
  consumeHereLocationSearchSlot,
  getHereLocationSearchAvailability,
  getHereLocationSearchFetchTimeoutMs,
  getHereLocationSearchLookupCacheTtlMs,
  readHereLocationSearchCache,
  writeHereLocationSearchCache,
} from "@/app/api/location-search/_lib/here-location-guard";

const HERE_API_KEY = process.env.HERE_API_KEY;
const HERE_LOOKUP_URL = "https://lookup.search.hereapi.com/v1/lookup";
const MAX_PROVIDER_ID_LENGTH = 256;

type HereLookupItem = {
  id?: string;
  title?: string;
  address?: {
    label?: string;
    countryCode?: string;
  };
  position?: {
    lat?: number;
    lng?: number;
  };
};

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

  const providerId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!providerId) {
    return buildProtectedResponse(
      { detail: "id is required." },
      authResult.refreshedAccessToken,
      400,
    );
  }
  if (providerId.length > MAX_PROVIDER_ID_LENGTH) {
    return buildProtectedResponse(
      { detail: "Location id is too long." },
      authResult.refreshedAccessToken,
      400,
    );
  }

  const cacheKey = `lookup:${providerId}`;
  const cachedLocation = readHereLocationSearchCache<{
    destination: string;
    destination_country_code: string;
    destination_lat: number | null;
    destination_lng: number | null;
    destination_provider: "here";
    destination_provider_id: string;
  }>({ key: cacheKey });

  if (cachedLocation) {
    return buildProtectedResponse(cachedLocation, authResult.refreshedAccessToken);
  }

  const rateLimit = consumeHereLocationSearchSlot({ bucketKey: userId });
  if (!rateLimit.allowed) {
    const response = buildProtectedResponse(
      { detail: "HERE location lookup is temporarily rate limited." },
      authResult.refreshedAccessToken,
      429,
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
  }

  const url = new URL(HERE_LOOKUP_URL);
  url.searchParams.set("id", providerId);
  url.searchParams.set("apiKey", hereApiKey);
  url.searchParams.set("lang", "vi-VN");
  url.searchParams.set("politicalView", "VNM");

  try {
    const res = await fetchHere(url);
    if (!res.ok) {
      return buildProtectedResponse(
        { detail: "Location lookup failed." },
        authResult.refreshedAccessToken,
        502,
      );
    }

    const item = (await res.json()) as HereLookupItem;
    if (!item?.id) {
      return buildProtectedResponse(
        { detail: "Location not found." },
        authResult.refreshedAccessToken,
        502,
      );
    }

    const payload = {
      destination: item.address?.label ?? item.title ?? "",
      destination_provider: "here",
      destination_provider_id: item.id ?? providerId,
      destination_lat: item.position?.lat ?? null,
      destination_lng: item.position?.lng ?? null,
      destination_country_code: normalizeCountryCode(item.address?.countryCode),
    };

    writeHereLocationSearchCache({
      key: cacheKey,
      ttlMs: getHereLocationSearchLookupCacheTtlMs(),
      value: payload,
    });

    return buildProtectedResponse(payload, authResult.refreshedAccessToken);
  } catch {
    return buildProtectedResponse(
      { detail: "Failed to lookup location." },
      authResult.refreshedAccessToken,
      502,
    );
  }
}
