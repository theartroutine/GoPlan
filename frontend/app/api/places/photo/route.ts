import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE_NAME } from "@/app/api/auth/_lib/session-state";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = "https://places.googleapis.com/v1";

// Allowlist: "places/{placeId}/photos/{photoRef}" — prevents SSRF
const PHOTO_REF_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

type GooglePhotoMediaResponse = {
  photoUri?: string;
};

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ detail: "Places API not configured." }, { status: 503 });
  }

  const jar = await cookies();
  if (!jar.get(REFRESH_COOKIE_NAME)?.value) {
    return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  }

  const ref = request.nextUrl.searchParams.get("ref");
  const rawMaxwidth = request.nextUrl.searchParams.get("maxwidth") ?? "800";
  const maxwidthNum = Number(rawMaxwidth);
  if (!Number.isInteger(maxwidthNum) || maxwidthNum < 1 || maxwidthNum > 4800) {
    return NextResponse.json({ detail: "Invalid maxwidth parameter." }, { status: 400 });
  }

  if (!ref || !PHOTO_REF_PATTERN.test(ref)) {
    return NextResponse.json({ detail: "Invalid photo reference." }, { status: 400 });
  }

  try {
    // Step 1: get the photoUri without following a redirect (avoids exposing the key in a redirect URL)
    const mediaUrl = `${PLACES_BASE}/${ref}/media?maxWidthPx=${maxwidthNum}&skipHttpRedirect=true`;
    const metaRes = await fetch(mediaUrl, {
      headers: { "X-Goog-Api-Key": API_KEY },
    });

    if (!metaRes.ok) {
      return NextResponse.json({ detail: "Photo not available." }, { status: 502 });
    }

    const meta = (await metaRes.json()) as GooglePhotoMediaResponse;
    if (!meta.photoUri) {
      return NextResponse.json({ detail: "Photo URI missing." }, { status: 502 });
    }

    // Step 2: fetch the actual image bytes and stream them to the client
    const imageRes = await fetch(meta.photoUri);
    if (!imageRes.ok) {
      return NextResponse.json({ detail: "Photo fetch failed." }, { status: 502 });
    }

    const buffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ detail: "Photo service unavailable." }, { status: 502 });
  }
}
