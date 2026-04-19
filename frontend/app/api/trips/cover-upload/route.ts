import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { API_BASE_URL } from "@/shared/http/config";

export async function POST(request: NextRequest) {
  // Auth: bffUploadTripCover (client) always sends a fresh Bearer token from tokenManager.
  // Refresh cookie is a fallback only; we do not replicate protectedUpstreamCall's
  // server-side retry-on-401 because it is redundant with the client-side invariant.
  let bearerToken = request.headers.get("Authorization");
  let refreshedAccessToken: string | null = null;

  if (!bearerToken) {
    const jar = await cookies();
    const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
    }
    const refreshResult = await refreshWithSingleFlight(refreshToken);
    const failureResponse = handleRefreshFailure(jar, refreshResult);
    if (failureResponse) return failureResponse;
    if (refreshResult.kind !== "success") {
      return NextResponse.json({ detail: "Auth failed." }, { status: 401 });
    }
    setRefreshToken(jar, refreshResult.refreshToken);
    bearerToken = `Bearer ${refreshResult.accessToken}`;
    refreshedAccessToken = refreshResult.accessToken;
  }

  // Parse body before the upstream try block so a malformed or missing
  // multipart body returns 400 (bad request) rather than 503 (service error).
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ detail: "No file provided." }, { status: 400 });
  }

  try {
    const djangoForm = new FormData();
    djangoForm.append("file", file);

    const res = await fetch(`${API_BASE_URL}/api/media/trip-covers`, {
      method: "POST",
      headers: { Authorization: bearerToken },
      body: djangoForm,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text || "Upload failed." };
    }

    const response = NextResponse.json(data, { status: res.status });
    if (refreshedAccessToken) {
      response.headers.set("X-Access-Token", refreshedAccessToken);
    }
    return response;
  } catch {
    return NextResponse.json({ detail: "Upload service unavailable." }, { status: 503 });
  }
}
