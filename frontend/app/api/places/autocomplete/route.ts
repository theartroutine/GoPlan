import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE_NAME } from "@/app/api/auth/_lib/session-state";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = "https://places.googleapis.com/v1";

type AutocompleteBody = {
  input?: string;
  sessionToken?: string;
};

type GooglePlacePrediction = {
  placeId?: string;
  text?: { text: string };
  structuredFormat?: {
    mainText?: { text: string };
    secondaryText?: { text: string };
  };
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{ placePrediction?: GooglePlacePrediction }>;
};

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ detail: "Places API not configured." }, { status: 503 });
  }

  const jar = await cookies();
  if (!jar.get(REFRESH_COOKIE_NAME)?.value) {
    return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json()) as AutocompleteBody;
  const input = body.input?.trim() ?? "";
  const sessionToken = body.sessionToken;

  if (input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
      },
      body: JSON.stringify({
        input,
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ detail: "Places service unavailable." }, { status: 502 });
    }

    const data = (await res.json()) as GoogleAutocompleteResponse;
    const suggestions = (data.suggestions ?? [])
      .map((s) => {
        const pp = s.placePrediction;
        return {
          place_id: pp?.placeId ?? "",
          main_text: pp?.structuredFormat?.mainText?.text ?? pp?.text?.text ?? "",
          secondary_text: pp?.structuredFormat?.secondaryText?.text ?? "",
        };
      })
      .filter((s) => s.place_id.length > 0);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ detail: "Failed to fetch suggestions." }, { status: 502 });
  }
}
