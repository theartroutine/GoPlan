import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE_NAME } from "@/app/api/auth/_lib/session-state";
import {
  consumeHereLocationSearchSlot,
  getHereLocationSearchAvailability,
  getHereLocationSearchSuggestCacheTtlMs,
  readHereLocationSearchCache,
  writeHereLocationSearchCache,
} from "@/app/api/location-search/_lib/here-location-guard";

const HERE_API_KEY = process.env.HERE_API_KEY;
const HERE_AUTOSUGGEST_URL = "https://geocode.search.hereapi.com/v1/autosuggest";
const VIETNAM_BIAS_AT = "16.047079,108.206230";

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

export async function GET(request: NextRequest) {
  const availability = getHereLocationSearchAvailability();
  if (!availability.enabled) {
    return NextResponse.json({ detail: availability.detail }, { status: 503 });
  }

  const jar = await cookies();
  if (!jar.get(REFRESH_COOKIE_NAME)?.value) {
    return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] });
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
    return NextResponse.json({ suggestions: cachedSuggestions });
  }

  const rateLimit = consumeHereLocationSearchSlot();
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { detail: "HERE location search is temporarily rate limited." },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  const url = new URL(HERE_AUTOSUGGEST_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("apiKey", HERE_API_KEY);
  url.searchParams.set("lang", "vi-VN");
  url.searchParams.set("politicalView", "VNM");
  // HERE autosuggest requires a spatial bias. Use Vietnam as the default bias
  // so local searches behave well while still allowing global results.
  url.searchParams.set("at", VIETNAM_BIAS_AT);
  url.searchParams.set("limit", "8");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ detail: "Location service unavailable." }, { status: 502 });
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

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ detail: "Failed to fetch suggestions." }, { status: 502 });
  }
}
