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

type ProxyProtectedVideoStreamOptions = {
  request: Pick<NextRequest, "headers">;
  upstreamPath: string;
  fallbackDetail: string;
};

type ProxyPublicVideoStreamOptions = {
  request: Pick<NextRequest, "headers">;
  upstreamPath: string;
  fallbackDetail: string;
};

type AuthResult =
  | { ok: true; bearer: string; refreshedAccessToken: string | null }
  | { ok: false; response: NextResponse };

const STREAM_HEADER_NAMES = [
  "Accept-Ranges",
  "Content-Range",
  "Content-Length",
  "Content-Type",
  "Content-Disposition",
  "Cache-Control",
] as const;

function extractRangeHeader(request: Pick<NextRequest, "headers">): string | null {
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

function buildProtectedUpstreamHeaders(
  request: Pick<NextRequest, "headers">,
  bearer: string,
) {
  const headers: Record<string, string> = { Authorization: bearer };
  const range = extractRangeHeader(request);
  if (range) headers.Range = range;
  return headers;
}

function buildPublicUpstreamHeaders(request: Pick<NextRequest, "headers">) {
  const headers: Record<string, string> = {};
  const range = extractRangeHeader(request);
  if (range) headers.Range = range;
  return headers;
}

async function fetchProtectedStream(
  request: Pick<NextRequest, "headers">,
  upstreamPath: string,
  bearer: string,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${upstreamPath}`, {
    method: "GET",
    headers: buildProtectedUpstreamHeaders(request, bearer),
  });
}

async function fetchPublicStream(
  request: Pick<NextRequest, "headers">,
  upstreamPath: string,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${upstreamPath}`, {
    method: "GET",
    headers: buildPublicUpstreamHeaders(request),
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

function isStreamableMediaResponse(upstream: Response): boolean {
  if (upstream.status === 416 && upstream.headers.has("Content-Range")) {
    return true;
  }

  const contentType = upstream.headers.get("Content-Type")?.toLowerCase() ?? "";
  const hasMediaContentType =
    contentType.startsWith("video/") || contentType.startsWith("image/");
  const hasRangeHeader =
    upstream.headers.has("Accept-Ranges") || upstream.headers.has("Content-Range");

  return (upstream.ok || upstream.status === 206) && (hasMediaContentType || hasRangeHeader);
}

function streamResponse(
  upstream: Response,
  refreshedAccessToken: string | null,
): NextResponse {
  const headers = new Headers();
  for (const headerName of STREAM_HEADER_NAMES) {
    const value = upstream.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });

  setNoStoreHeaders(response);

  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
  }

  return response;
}

async function finalizeStreamResponse(
  upstream: Response,
  fallbackDetail: string,
  refreshedAccessToken: string | null,
): Promise<NextResponse> {
  if (isStreamableMediaResponse(upstream)) {
    return streamResponse(upstream, refreshedAccessToken);
  }

  if (!upstream.ok) {
    const response = await jsonErrorResponse(upstream, fallbackDetail);
    if (refreshedAccessToken) {
      response.headers.set("X-Access-Token", refreshedAccessToken);
      setNoStoreHeaders(response);
    }
    return response;
  }

  return NextResponse.json(
    {
      detail: "Video stream response was not media.",
      error_code: "INVALID_VIDEO_STREAM",
    },
    { status: 502 },
  );
}

export async function proxyProtectedVideoStream({
  request,
  upstreamPath,
  fallbackDetail,
}: ProxyProtectedVideoStreamOptions): Promise<NextResponse> {
  const jar = await cookies();
  const incomingAuth = request.headers.get("Authorization");
  const auth = await resolveBearer(jar, incomingAuth);
  if (!auth.ok) return auth.response;

  let upstream: Response;
  try {
    upstream = await fetchProtectedStream(request, upstreamPath, auth.bearer);
  } catch {
    return NextResponse.json(
      { detail: "Video stream service unavailable." },
      { status: 503 },
    );
  }

  let refreshedAccessToken = auth.refreshedAccessToken;
  if (upstream.status === 401 && incomingAuth && refreshedAccessToken === null) {
    const retry = await resolveBearer(jar, null);
    if (!retry.ok) return retry.response;
    refreshedAccessToken = retry.refreshedAccessToken;
    try {
      upstream = await fetchProtectedStream(request, upstreamPath, retry.bearer);
    } catch {
      return NextResponse.json(
        { detail: "Video stream service unavailable." },
        { status: 503 },
      );
    }
  }

  return finalizeStreamResponse(upstream, fallbackDetail, refreshedAccessToken);
}

export async function proxyPublicVideoStream({
  request,
  upstreamPath,
  fallbackDetail,
}: ProxyPublicVideoStreamOptions): Promise<NextResponse> {
  let upstream: Response;
  try {
    upstream = await fetchPublicStream(request, upstreamPath);
  } catch {
    return NextResponse.json(
      { detail: "Memory asset service unavailable." },
      { status: 503 },
    );
  }

  return finalizeStreamResponse(upstream, fallbackDetail, null);
}
