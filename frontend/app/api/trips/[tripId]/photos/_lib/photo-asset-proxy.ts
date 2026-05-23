import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setNoStoreHeaders,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { API_BASE_URL } from "@/shared/http/config";

type PhotoVariant = "thumbnail" | "medium";

type ProxyTripPhotoAssetOptions = {
  request: Pick<NextRequest, "headers">;
  tripId: string;
  photoId: string;
  variant: PhotoVariant;
};

type AuthResult =
  | { ok: true; bearer: string; refreshedAccessToken: string | null }
  | { ok: false; response: NextResponse };

async function resolveBearer(
  jar: Awaited<ReturnType<typeof cookies>>,
  incomingAuth: string | null,
): Promise<AuthResult> {
  if (incomingAuth) {
    return { ok: true, bearer: incomingAuth, refreshedAccessToken: null };
  }

  const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return {
      ok: false,
      response: NextResponse.json({ detail: "Not authenticated." }, { status: 401 }),
    };
  }

  const refreshResult = await refreshWithSingleFlight(refreshToken);
  const failureResponse = handleRefreshFailure(jar, refreshResult);
  if (failureResponse) return { ok: false, response: failureResponse };
  if (refreshResult.kind !== "success") {
    return {
      ok: false,
      response: NextResponse.json({ detail: "Auth failed." }, { status: 401 }),
    };
  }

  setRefreshToken(jar, refreshResult.refreshToken);
  return {
    ok: true,
    bearer: `Bearer ${refreshResult.accessToken}`,
    refreshedAccessToken: refreshResult.accessToken,
  };
}

function buildAssetUrl(tripId: string, photoId: string, variant: PhotoVariant): string {
  return `${API_BASE_URL}/api/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}/${variant}`;
}

async function fetchAsset(
  tripId: string,
  photoId: string,
  variant: PhotoVariant,
  bearer: string,
): Promise<Response> {
  return fetch(buildAssetUrl(tripId, photoId, variant), {
    method: "GET",
    headers: { Authorization: bearer },
  });
}

async function jsonErrorResponse(
  upstream: Response,
  fallbackDetail: string,
): Promise<NextResponse> {
  const text = await upstream.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : { detail: fallbackDetail };
  } catch {
    data = { detail: text || fallbackDetail };
  }

  const response = NextResponse.json(data, { status: upstream.status });
  const retryAfter = upstream.headers.get("Retry-After");
  if (retryAfter) response.headers.set("Retry-After", retryAfter);
  return response;
}

async function finalizeAssetResponse(
  upstream: Response,
  refreshedAccessToken: string | null,
): Promise<NextResponse> {
  if (!upstream.ok) {
    const errorResponse = await jsonErrorResponse(upstream, "Photo asset request failed.");
    if (refreshedAccessToken) {
      errorResponse.headers.set("X-Access-Token", refreshedAccessToken);
      setNoStoreHeaders(errorResponse);
    }
    return errorResponse;
  }

  const contentType = upstream.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json(
      {
        detail: "Photo asset response was not an image.",
        error_code: "INVALID_PHOTO_ASSET",
      },
      { status: 502 },
    );
  }

  const response = new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": contentType,
    },
  });
  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
    setNoStoreHeaders(response);
  }
  return response;
}

export async function proxyTripPhotoAsset({
  request,
  tripId,
  photoId,
  variant,
}: ProxyTripPhotoAssetOptions): Promise<NextResponse> {
  const jar = await cookies();
  const incomingAuth = request.headers.get("Authorization");
  const auth = await resolveBearer(jar, incomingAuth);
  if (!auth.ok) return auth.response;

  let upstream: Response;
  try {
    upstream = await fetchAsset(tripId, photoId, variant, auth.bearer);
  } catch {
    return NextResponse.json(
      { detail: "Photo asset service unavailable." },
      { status: 503 },
    );
  }

  let refreshedAccessToken = auth.refreshedAccessToken;
  if (upstream.status === 401 && incomingAuth && refreshedAccessToken === null) {
    const retry = await resolveBearer(jar, null);
    if (!retry.ok) return retry.response;
    refreshedAccessToken = retry.refreshedAccessToken;
    try {
      upstream = await fetchAsset(tripId, photoId, variant, retry.bearer);
    } catch {
      return NextResponse.json(
        { detail: "Photo asset service unavailable." },
        { status: 503 },
      );
    }
  }

  return finalizeAssetResponse(upstream, refreshedAccessToken);
}
