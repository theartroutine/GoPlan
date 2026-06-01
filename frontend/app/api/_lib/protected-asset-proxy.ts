import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { API_BASE_URL } from "@/shared/http/config";

type AuthResult =
  | { ok: true; bearer: string; refreshedAccessToken: string | null }
  | { ok: false; response: NextResponse };

type ProxyProtectedAssetOptions = {
  request: Pick<NextRequest, "headers">;
  upstreamPath: string;
  fallbackDetail: string;
  serviceUnavailableDetail: string;
  buildUpstreamHeaders?: (
    request: Pick<NextRequest, "headers">,
    bearer: string,
  ) => Record<string, string>;
  finalizeResponse: (
    upstream: Response,
    fallbackDetail: string,
    refreshedAccessToken: string | null,
  ) => Promise<NextResponse>;
};

export function extractRangeHeader(
  request: Pick<NextRequest, "headers">,
): string | null {
  return (
    request.headers.get("Range") ??
    Array.from(request.headers.entries()).find(
      ([name]) => name.toLowerCase() === "range",
    )?.[1] ??
    null
  );
}

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

async function fetchProtectedAsset(
  request: Pick<NextRequest, "headers">,
  upstreamPath: string,
  bearer: string,
  buildUpstreamHeaders: NonNullable<ProxyProtectedAssetOptions["buildUpstreamHeaders"]>,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${upstreamPath}`, {
    method: "GET",
    headers: buildUpstreamHeaders(request, bearer),
  });
}

export async function jsonErrorResponse(
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

export async function proxyProtectedAsset({
  request,
  upstreamPath,
  fallbackDetail,
  serviceUnavailableDetail,
  buildUpstreamHeaders = (_request, bearer) => ({ Authorization: bearer }),
  finalizeResponse,
}: ProxyProtectedAssetOptions): Promise<NextResponse> {
  const jar = await cookies();
  const incomingAuth = request.headers.get("Authorization");
  const auth = await resolveBearer(jar, incomingAuth);
  if (!auth.ok) return auth.response;

  let upstream: Response;
  try {
    upstream = await fetchProtectedAsset(
      request,
      upstreamPath,
      auth.bearer,
      buildUpstreamHeaders,
    );
  } catch {
    return NextResponse.json(
      { detail: serviceUnavailableDetail },
      { status: 503 },
    );
  }

  let refreshedAccessToken = auth.refreshedAccessToken;
  if (upstream.status === 401 && incomingAuth && refreshedAccessToken === null) {
    const retry = await resolveBearer(jar, null);
    if (!retry.ok) return retry.response;
    refreshedAccessToken = retry.refreshedAccessToken;
    try {
      upstream = await fetchProtectedAsset(
        request,
        upstreamPath,
        retry.bearer,
        buildUpstreamHeaders,
      );
    } catch {
      return NextResponse.json(
        { detail: serviceUnavailableDetail },
        { status: 503 },
      );
    }
  }

  return finalizeResponse(upstream, fallbackDetail, refreshedAccessToken);
}
