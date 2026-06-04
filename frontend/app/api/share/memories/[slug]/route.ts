import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { API_BASE_URL } from "@/shared/http/config";

type RouteContext = { params: Promise<{ slug: string }> };

const PUBLIC_METADATA_CACHE_CONTROL = "no-store";

type PublicMemoryPayload = {
  title: string;
  poster_url: string;
  video_url: string;
  duration_seconds: number | null;
  source_photo_count: number;
  music: PublicMemoryMusic | null;
};

type PublicMemoryMusic = {
  title: string;
  artist: string;
  license: string;
  license_url: string;
  source_url: string;
};

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: "Public memory request failed." };
  }
}

function buildJsonResponse(
  data: unknown,
  status: number,
  upstreamHeaders?: Headers,
): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", PUBLIC_METADATA_CACHE_CONTROL);

  const retryAfter = upstreamHeaders?.get("Retry-After");
  if (retryAfter) response.headers.set("Retry-After", retryAfter);

  return response;
}

function isPublicMemoryPayload(value: unknown): value is PublicMemoryPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.poster_url === "string" &&
    typeof candidate.video_url === "string" &&
    (
      typeof candidate.duration_seconds === "number" ||
      candidate.duration_seconds === null
    ) &&
    typeof candidate.source_photo_count === "number"
  );
}

function isPublicMemoryMusic(value: unknown): value is PublicMemoryMusic | null {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.artist === "string" &&
    typeof candidate.license === "string" &&
    typeof candidate.license_url === "string" &&
    typeof candidate.source_url === "string"
  );
}

function normalizePublicMemoryPayload(
  data: unknown,
  encodedSlug: string,
): PublicMemoryPayload | null {
  if (!isPublicMemoryPayload(data)) return null;

  return {
    title: data.title,
    poster_url: `/api/share/memories/${encodedSlug}/poster`,
    video_url: `/api/share/memories/${encodedSlug}/video`,
    duration_seconds: data.duration_seconds,
    source_photo_count: data.source_photo_count,
    music: isPublicMemoryMusic(data.music) ? data.music : null,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const encodedSlug = encodeURIComponent(slug);

  try {
    const upstream = await fetch(
      `${API_BASE_URL}/api/public/memories/${encodedSlug}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const data = await parseJsonResponse(upstream);
    if (upstream.ok) {
      const publicMemory = normalizePublicMemoryPayload(data, encodedSlug);
      if (!publicMemory) {
        return buildJsonResponse(
          { detail: "Public memory response was invalid." },
          502,
          upstream.headers,
        );
      }
      return buildJsonResponse(publicMemory, upstream.status, upstream.headers);
    }

    return buildJsonResponse(
      data,
      upstream.status,
      upstream.headers,
    );
  } catch {
    return buildJsonResponse(
      { detail: "Public memory service unavailable." },
      503,
    );
  }
}
