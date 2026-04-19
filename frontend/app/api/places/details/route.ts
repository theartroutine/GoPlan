import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK = "id,displayName,location,addressComponents,photos";

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types: string[];
};

type Photo = {
  name?: string;
};

type GooglePlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  addressComponents?: AddressComponent[];
  photos?: Photo[];
};

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ detail: "Places API not configured." }, { status: 503 });
  }

  const placeId = request.nextUrl.searchParams.get("place_id");
  const sessionToken = request.nextUrl.searchParams.get("session_token");

  if (!placeId) {
    return NextResponse.json({ detail: "place_id is required." }, { status: 400 });
  }

  const url = new URL(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ detail: "Place not found." }, { status: 502 });
    }

    const data = (await res.json()) as GooglePlaceDetails;

    const countryComponent = (data.addressComponents ?? []).find((c) =>
      c.types.includes("country"),
    );

    const photoReference = data.photos?.[0]?.name ?? "";

    return NextResponse.json({
      place_id: data.id ?? placeId,
      name: data.displayName?.text ?? "",
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      country_code: countryComponent?.shortText ?? "",
      photo_reference: photoReference,
    });
  } catch {
    return NextResponse.json({ detail: "Failed to fetch place details." }, { status: 502 });
  }
}
