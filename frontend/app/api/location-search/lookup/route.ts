import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE_NAME } from "@/app/api/auth/_lib/session-state";
import {
  consumeHereLocationSearchSlot,
  getHereLocationSearchAvailability,
  getHereLocationSearchLookupCacheTtlMs,
  readHereLocationSearchCache,
  writeHereLocationSearchCache,
} from "@/app/api/location-search/_lib/here-location-guard";

const HERE_API_KEY = process.env.HERE_API_KEY;
const HERE_LOOKUP_URL = "https://lookup.search.hereapi.com/v1/lookup";

const viRegionNames = new Intl.DisplayNames(["vi-VN"], { type: "region" });
const localizedCountryNameToAlpha2 = new Map<string, string>();

for (let first = 65; first <= 90; first += 1) {
  for (let second = 65; second <= 90; second += 1) {
    const code = String.fromCharCode(first, second);
    const localizedName = viRegionNames.of(code);
    if (!localizedName || localizedName === code) continue;
    localizedCountryNameToAlpha2.set(localizedName.toLocaleLowerCase("vi-VN"), code);
  }
}

type HereLookupItem = {
  id?: string;
  title?: string;
  address?: {
    label?: string;
    countryCode?: string;
    countryName?: string;
  };
  position?: {
    lat?: number;
    lng?: number;
  };
};

function toAlpha2CountryCode(address?: HereLookupItem["address"]): string {
  const rawCountryCode = address?.countryCode?.toUpperCase() ?? "";
  if (rawCountryCode.length === 2) return rawCountryCode;

  const localizedName = address?.countryName?.toLocaleLowerCase("vi-VN") ?? "";
  return localizedCountryNameToAlpha2.get(localizedName) ?? "";
}

export async function GET(request: NextRequest) {
  const availability = getHereLocationSearchAvailability();
  if (!availability.enabled) {
    return NextResponse.json({ detail: availability.detail }, { status: 503 });
  }

  const jar = await cookies();
  if (!jar.get(REFRESH_COOKIE_NAME)?.value) {
    return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  }

  const providerId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!providerId) {
    return NextResponse.json({ detail: "id is required." }, { status: 400 });
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
    return NextResponse.json(cachedLocation);
  }

  const rateLimit = consumeHereLocationSearchSlot();
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { detail: "HERE location lookup is temporarily rate limited." },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  const url = new URL(HERE_LOOKUP_URL);
  url.searchParams.set("id", providerId);
  url.searchParams.set("apiKey", HERE_API_KEY);
  url.searchParams.set("lang", "vi-VN");
  url.searchParams.set("politicalView", "VNM");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ detail: "Location lookup failed." }, { status: 502 });
    }

    const item = (await res.json()) as HereLookupItem;
    if (!item?.id) return NextResponse.json({ detail: "Location not found." }, { status: 502 });

    const payload = {
      destination: item.address?.label ?? item.title ?? "",
      destination_provider: "here",
      destination_provider_id: item.id ?? providerId,
      destination_lat: item.position?.lat ?? null,
      destination_lng: item.position?.lng ?? null,
      destination_country_code: toAlpha2CountryCode(item.address),
    };

    writeHereLocationSearchCache({
      key: cacheKey,
      ttlMs: getHereLocationSearchLookupCacheTtlMs(),
      value: payload,
    });

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ detail: "Failed to lookup location." }, { status: 502 });
  }
}
