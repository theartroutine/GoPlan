import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  extractRangeHeader,
  jsonErrorResponse,
  proxyProtectedAsset,
} from "@/app/api/_lib/protected-asset-proxy";
import { setNoStoreHeaders } from "@/app/api/auth/_lib/session-state";
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

const STREAM_HEADER_NAMES = [
  "Accept-Ranges",
  "Content-Range",
  "Content-Length",
  "Content-Type",
  "Content-Disposition",
  "Cache-Control",
] as const;

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

async function fetchPublicStream(
  request: Pick<NextRequest, "headers">,
  upstreamPath: string,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${upstreamPath}`, {
    method: "GET",
    headers: buildPublicUpstreamHeaders(request),
  });
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
  return proxyProtectedAsset({
    request,
    upstreamPath,
    fallbackDetail,
    serviceUnavailableDetail: "Video stream service unavailable.",
    buildUpstreamHeaders: buildProtectedUpstreamHeaders,
    finalizeResponse: finalizeStreamResponse,
  });
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
