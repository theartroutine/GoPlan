import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";
import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setNoStoreHeaders,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { API_BASE_URL } from "@/shared/http/config";

type RouteContext = { params: Promise<{ tripId: string }> };

const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = MAX_FILES * MAX_FILE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const GENERIC_BINARY_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

function buildQuery(searchParams: URLSearchParams): string | undefined {
  const cursor = searchParams.get("cursor");
  return cursor ? new URLSearchParams({ cursor }).toString() : undefined;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function isHeicFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    HEIC_TYPES.has(file.type) ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  );
}

function isSvgFile(file: File): boolean {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

function hasKnownUnsupportedMime(file: File): boolean {
  return (
    file.type !== "" &&
    !GENERIC_BINARY_TYPES.has(file.type) &&
    !ALLOWED_TYPES.has(file.type)
  );
}

function validateContentLength(headers: Headers): NextResponse | null {
  const raw = headers.get("Content-Length");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;

  if (parsed > MAX_TOTAL_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        detail: `Upload body is too large. Upload at most ${MAX_FILES} photos of 10 MiB each.`,
        error_code: "UPLOAD_TOO_LARGE",
      },
      { status: 413 },
    );
  }

  return null;
}

function validateFiles(files: File[]): NextResponse | null {
  if (files.length === 0) {
    return NextResponse.json(
      {
        detail: "Select at least one photo to upload.",
        error_code: "NO_FILES",
      },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      {
        detail: `Upload at most ${MAX_FILES} photos at a time.`,
        error_code: "TOO_MANY_FILES",
      },
      { status: 400 },
    );
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          detail: "Photo exceeds 10 MiB limit.",
          error_code: "PHOTO_TOO_LARGE",
        },
        { status: 413 },
      );
    }
    if (isHeicFile(file)) {
      return NextResponse.json(
        {
          detail: "HEIC images are not supported yet. Convert to JPEG, PNG, or WebP.",
          error_code: "HEIC_UNSUPPORTED",
        },
        { status: 415 },
      );
    }
    if (isSvgFile(file) || hasKnownUnsupportedMime(file)) {
      return NextResponse.json(
        {
          detail: "Unsupported image format. Use JPEG, PNG, or WebP.",
          error_code: "UNSUPPORTED_IMAGE_TYPE",
        },
        { status: 415 },
      );
    }
  }
  return null;
}

async function resolveBearer(
  jar: Awaited<ReturnType<typeof cookies>>,
  incomingAuth: string | null,
): Promise<
  | { ok: true; bearer: string; refreshedAccessToken: string | null }
  | { ok: false; response: NextResponse }
> {
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

function buildDjangoForm(files: File[]): FormData {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  return form;
}

async function callPhotosUploadUpstream(
  tripId: string,
  bearer: string,
  files: File[],
): Promise<{ data: unknown; status: number; headers?: Headers }> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/trips/${encodeURIComponent(tripId)}/photos`,
      {
        method: "POST",
        headers: { Authorization: bearer },
        body: buildDjangoForm(files),
      },
    );
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: "Photo upload failed." };
    }
    return { data, status: res.status, headers: res.headers };
  } catch {
    return {
      data: { detail: "Photo upload service unavailable." },
      status: 503,
    };
  }
}

function finalizeUploadResponse(
  result: { data: unknown; status: number; headers?: Headers },
  refreshedAccessToken: string | null,
): NextResponse {
  const response = NextResponse.json(result.data, { status: result.status });
  const retryAfter = result.headers?.get("Retry-After");
  if (retryAfter) response.headers.set("Retry-After", retryAfter);
  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
    setNoStoreHeaders(response);
  }
  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId } = await context.params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/photos`,
    method: "GET",
    query: buildQuery(request.nextUrl.searchParams),
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken, result.status);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { tripId } = await context.params;
  const bodyTooLargeResponse = validateContentLength(request.headers);
  if (bodyTooLargeResponse) return bodyTooLargeResponse;

  const jar = await cookies();
  const incomingAuth = request.headers.get("Authorization");
  const auth = await resolveBearer(jar, incomingAuth);
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const files = formData.getAll("files").filter(isFile);
  const invalidResponse = validateFiles(files);
  if (invalidResponse) return invalidResponse;

  let result = await callPhotosUploadUpstream(tripId, auth.bearer, files);
  let refreshedAccessToken = auth.refreshedAccessToken;

  if (result.status === 401 && incomingAuth && refreshedAccessToken === null) {
    const retry = await resolveBearer(jar, null);
    if (!retry.ok) return retry.response;
    refreshedAccessToken = retry.refreshedAccessToken;
    result = await callPhotosUploadUpstream(tripId, retry.bearer, files);
  }

  return finalizeUploadResponse(result, refreshedAccessToken);
}
