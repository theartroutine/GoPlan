import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { API_BASE_URL } from "@/shared/http/config";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const FILE_TOO_LARGE_PAYLOAD = {
  detail: "File too large. Maximum size is 5 MB.",
  error_code: "FILE_TOO_LARGE",
};

function fileTooLargeResponse(): NextResponse {
  return NextResponse.json(FILE_TOO_LARGE_PAYLOAD, { status: 413 });
}

async function uploadTripCover(
  file: Blob,
  bearerToken: string,
): Promise<{ data: unknown; status: number }> {
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

  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const contentLengthBytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(contentLengthBytes) && contentLengthBytes > MAX_UPLOAD_BYTES) {
      return fileTooLargeResponse();
    }
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

  try {
    let result = await uploadTripCover(file, bearerToken);

    if (result.status === 401) {
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
      refreshedAccessToken = refreshResult.accessToken;
      result = await uploadTripCover(file, `Bearer ${refreshResult.accessToken}`);
    }

    const response = NextResponse.json(result.data, { status: result.status });
    if (refreshedAccessToken) {
      response.headers.set("X-Access-Token", refreshedAccessToken);
    }
    return response;
  } catch {
    return NextResponse.json({ detail: "Upload service unavailable." }, { status: 503 });
  }
}
