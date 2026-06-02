import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";
import {
  TRIP_PHOTO_MAX_BODY_BYTES,
  TRIP_PHOTO_MAX_FILE_BYTES,
  TRIP_PHOTO_MAX_FILES,
  TRIP_PHOTO_MAX_TOTAL_UPLOAD_BYTES,
  hasKnownUnsupportedTripPhotoMime,
  isTripPhotoHeicFile,
  isTripPhotoSvgFile,
  totalTripPhotoFileBytes,
} from "@/features/trips/domain/photo-constraints";

type RouteContext = { params: Promise<{ tripId: string }> };

function buildQuery(searchParams: URLSearchParams): string | undefined {
  const query = new URLSearchParams();
  const cursor = searchParams.get("cursor");
  const pageSize = searchParams.get("page_size");
  if (cursor) query.set("cursor", cursor);
  if (pageSize) query.set("page_size", pageSize);
  const value = query.toString();
  return value.length > 0 ? value : undefined;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function validateContentLength(headers: Headers): NextResponse | null {
  const raw = headers.get("Content-Length");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;

  if (parsed > TRIP_PHOTO_MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        detail: "Upload body is too large. Upload at most 50 MiB of photos at a time.",
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
  if (files.length > TRIP_PHOTO_MAX_FILES) {
    return NextResponse.json(
      {
        detail: `Upload at most ${TRIP_PHOTO_MAX_FILES} photos at a time.`,
        error_code: "TOO_MANY_FILES",
      },
      { status: 400 },
    );
  }
  for (const file of files) {
    if (file.size > TRIP_PHOTO_MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          detail: "Photo exceeds 10 MiB limit.",
          error_code: "PHOTO_TOO_LARGE",
        },
        { status: 413 },
      );
    }
    if (isTripPhotoHeicFile(file)) {
      return NextResponse.json(
        {
          detail: "HEIC images are not supported yet. Convert to JPEG, PNG, or WebP.",
          error_code: "HEIC_UNSUPPORTED",
        },
        { status: 415 },
      );
    }
    if (isTripPhotoSvgFile(file) || hasKnownUnsupportedTripPhotoMime(file)) {
      return NextResponse.json(
        {
          detail: "Unsupported image format. Use JPEG, PNG, or WebP.",
          error_code: "UNSUPPORTED_IMAGE_TYPE",
        },
        { status: 415 },
      );
    }
  }

  if (totalTripPhotoFileBytes(files) > TRIP_PHOTO_MAX_TOTAL_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        detail: "Upload at most 50 MiB of photos at a time.",
        error_code: "PHOTO_UPLOAD_TOO_LARGE",
      },
      { status: 413 },
    );
  }

  return null;
}

function buildDjangoForm(files: File[]): FormData {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  return form;
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const files = formData.getAll("files").filter(isFile);
  const invalidResponse = validateFiles(files);
  if (invalidResponse) return invalidResponse;

  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/photos`,
    method: "POST",
    authorization: request.headers.get("Authorization"),
    body: buildDjangoForm(files),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken, result.status);
}
