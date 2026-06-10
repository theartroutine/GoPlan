import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setNoStoreHeaders,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { mergeHeadersWithTrustedClient } from "@/app/api/_lib/upstream-headers";
import { API_BASE_URL } from "@/shared/http/config";

// Must match TRIP_COVER_MAX_BYTES on the Django side.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const FILE_TOO_LARGE_PAYLOAD = {
  detail: "File too large. Maximum size is 10 MB.",
  error_code: "FILE_TOO_LARGE",
};
const UNSUPPORTED_MEDIA_PAYLOAD = {
  detail: "Unsupported image type. Use JPEG, PNG, or WebP.",
  error_code: "UNSUPPORTED_MEDIA_TYPE",
};

function fileTooLargeResponse(): NextResponse {
  return NextResponse.json(FILE_TOO_LARGE_PAYLOAD, { status: 413 });
}

function unsupportedMediaResponse(): NextResponse {
  return NextResponse.json(UNSUPPORTED_MEDIA_PAYLOAD, { status: 415 });
}

async function uploadTripCover(
  file: Blob,
  bearerToken: string,
  sourceHeaders: Headers,
): Promise<{ data: unknown; status: number }> {
  const djangoForm = new FormData();
  djangoForm.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/media/trip-covers`, {
    method: "POST",
    headers: mergeHeadersWithTrustedClient(
      { Authorization: bearerToken },
      sourceHeaders,
    ),
    body: djangoForm,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text || "Upload failed." };
  }

  return { data, status: res.status };
}

export async function POST(request: NextRequest) {
  const jar = await cookies();
  let bearerToken = request.headers.get("Authorization");
  let refreshedAccessToken: string | null = null;

  if (!bearerToken) {
    const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
    }
    const refreshResult = await refreshWithSingleFlight(
      refreshToken,
      request.headers,
    );
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
  // multipart body returns 400 (bad request) rather than 503 (service unavailable).
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

  if (file.size > MAX_UPLOAD_BYTES) {
    return fileTooLargeResponse();
  }

  if (!ALLOWED_COVER_MIME_TYPES.has(file.type)) {
    return unsupportedMediaResponse();
  }

  try {
    let result = await uploadTripCover(file, bearerToken, request.headers);

    if (result.status === 401) {
      const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
      if (!refreshToken) {
        return NextResponse.json({ detail: "Not authenticated." }, { status: 401 });
      }

      const refreshResult = await refreshWithSingleFlight(
        refreshToken,
        request.headers,
      );
      const failureResponse = handleRefreshFailure(jar, refreshResult);
      if (failureResponse) return failureResponse;
      if (refreshResult.kind !== "success") {
        return NextResponse.json({ detail: "Auth failed." }, { status: 401 });
      }

      setRefreshToken(jar, refreshResult.refreshToken);
      refreshedAccessToken = refreshResult.accessToken;
      result = await uploadTripCover(
        file,
        `Bearer ${refreshResult.accessToken}`,
        request.headers,
      );
    }

    const response = NextResponse.json(result.data, { status: result.status });
    if (refreshedAccessToken) {
      response.headers.set("X-Access-Token", refreshedAccessToken);
      setNoStoreHeaders(response);
    }
    return response;
  } catch {
    return NextResponse.json({ detail: "Upload service unavailable." }, { status: 503 });
  }
}
