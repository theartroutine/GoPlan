import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  jsonErrorResponse,
  proxyProtectedAsset,
} from "@/app/api/_lib/protected-asset-proxy";
import { setNoStoreHeaders } from "@/app/api/auth/_lib/session-state";

type PhotoVariant = "thumbnail" | "medium";

const PHOTO_ASSET_CACHE_CONTROL = "private, no-store";

type ProxyTripPhotoAssetOptions = {
  request: Pick<NextRequest, "headers">;
  tripId: string;
  photoId: string;
  variant: PhotoVariant;
};

function buildAssetPath(tripId: string, photoId: string, variant: PhotoVariant): string {
  return `/api/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}/${variant}`;
}

function setPhotoAssetNoStoreHeaders(response: NextResponse): NextResponse {
  setNoStoreHeaders(response);
  response.headers.set("Cache-Control", PHOTO_ASSET_CACHE_CONTROL);
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
      setPhotoAssetNoStoreHeaders(errorResponse);
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

  const headers = new Headers({
    "Cache-Control": PHOTO_ASSET_CACHE_CONTROL,
    "Content-Type": contentType,
  });
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
    setPhotoAssetNoStoreHeaders(response);
  }
  return response;
}

export async function proxyTripPhotoAsset({
  request,
  tripId,
  photoId,
  variant,
}: ProxyTripPhotoAssetOptions): Promise<NextResponse> {
  return proxyProtectedAsset({
    request,
    upstreamPath: buildAssetPath(tripId, photoId, variant),
    fallbackDetail: "Photo asset request failed.",
    serviceUnavailableDetail: "Photo asset service unavailable.",
    finalizeResponse: async (upstream, _fallbackDetail, refreshedAccessToken) =>
      finalizeAssetResponse(upstream, refreshedAccessToken),
  });
}

const PHOTO_DOWNLOAD_FALLBACK = "Photo download failed.";
const PHOTO_DOWNLOAD_UNAVAILABLE = "Photo download service unavailable.";

async function finalizeDownloadResponse(
  upstream: Response,
  refreshedAccessToken: string | null,
  defaultContentType: string,
): Promise<NextResponse> {
  if (!upstream.ok) {
    const errorResponse = await jsonErrorResponse(upstream, PHOTO_DOWNLOAD_FALLBACK);
    if (refreshedAccessToken) {
      errorResponse.headers.set("X-Access-Token", refreshedAccessToken);
      setPhotoAssetNoStoreHeaders(errorResponse);
    }
    return errorResponse;
  }

  const headers = new Headers({
    "Cache-Control": PHOTO_ASSET_CACHE_CONTROL,
    "Content-Type": upstream.headers.get("Content-Type") ?? defaultContentType,
  });
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const disposition = upstream.headers.get("Content-Disposition");
  if (disposition) headers.set("Content-Disposition", disposition);

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
    setPhotoAssetNoStoreHeaders(response);
  }
  return response;
}

export async function proxyTripPhotoDownload({
  request,
  tripId,
  photoId,
}: {
  request: Pick<NextRequest, "headers">;
  tripId: string;
  photoId: string;
}): Promise<NextResponse> {
  return proxyProtectedAsset({
    request,
    upstreamPath: `/api/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}/download`,
    fallbackDetail: PHOTO_DOWNLOAD_FALLBACK,
    serviceUnavailableDetail: PHOTO_DOWNLOAD_UNAVAILABLE,
    finalizeResponse: async (upstream, _fallbackDetail, refreshedAccessToken) =>
      finalizeDownloadResponse(upstream, refreshedAccessToken, "image/webp"),
  });
}

export async function proxyTripPhotosBulkDownload({
  request,
  tripId,
  body,
}: {
  request: Pick<NextRequest, "headers">;
  tripId: string;
  body: string;
}): Promise<NextResponse> {
  return proxyProtectedAsset({
    request,
    upstreamPath: `/api/trips/${encodeURIComponent(tripId)}/photos/download`,
    fallbackDetail: PHOTO_DOWNLOAD_FALLBACK,
    serviceUnavailableDetail: PHOTO_DOWNLOAD_UNAVAILABLE,
    method: "POST",
    body,
    buildUpstreamHeaders: (_request, bearer) => ({
      Authorization: bearer,
      "Content-Type": "application/json",
    }),
    finalizeResponse: async (upstream, _fallbackDetail, refreshedAccessToken) =>
      finalizeDownloadResponse(upstream, refreshedAccessToken, "application/zip"),
  });
}
