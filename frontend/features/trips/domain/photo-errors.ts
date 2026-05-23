type ErrorResponse = {
  response?: {
    status?: unknown;
    data?: unknown;
  };
};

type PhotoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const GENERIC_BINARY_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

const ERROR_MESSAGES: Record<string, string> = {
  HEIC_UNSUPPORTED:
    "HEIC photos are not supported yet. Convert them to JPEG, PNG, or WebP and try again.",
  NO_FILES: "Choose at least one photo.",
  PHOTO_DIMENSIONS_TOO_LARGE:
    "That photo is too large to process. Use an image under 45 megapixels.",
  PHOTO_INVALID_IMAGE:
    "That photo could not be processed. Choose a valid JPEG, PNG, or WebP file.",
  PHOTO_STORAGE_ERROR: "We could not save the photos. Please try again.",
  PHOTO_TOO_LARGE: "Each photo must be 10 MiB or smaller.",
  PHOTO_DELETE_FORBIDDEN: "You can only delete photos you uploaded unless you own the trip.",
  TOO_MANY_FILES: "Upload up to 20 photos at a time.",
  TRIP_TERMINAL: "Cancelled trips cannot change photos.",
  UNSUPPORTED_IMAGE_TYPE:
    "Use JPEG, PNG, or WebP photos. SVG and other formats are not supported.",
};

function getErrorCode(error: unknown): string | null {
  const data = (error as ErrorResponse | null)?.response?.data;
  if (!data || typeof data !== "object") return null;
  const code = (data as Record<string, unknown>).error_code;
  return typeof code === "string" && code.trim() ? code : null;
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const detail = (data as Record<string, unknown>).detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
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

export function getTripPhotoErrorMessage(error: unknown, fallback: string): string {
  const code = getErrorCode(error);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  const detail = extractErrorMessage((error as ErrorResponse | null)?.response?.data);
  return detail ?? fallback;
}

export function validateTripPhotoFiles(files: File[]): PhotoValidationResult {
  if (files.length === 0) {
    return { ok: false, message: ERROR_MESSAGES.NO_FILES };
  }
  if (files.length > MAX_FILES) {
    return { ok: false, message: ERROR_MESSAGES.TOO_MANY_FILES };
  }

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return { ok: false, message: ERROR_MESSAGES.PHOTO_TOO_LARGE };
    }
    if (isHeicFile(file)) {
      return { ok: false, message: ERROR_MESSAGES.HEIC_UNSUPPORTED };
    }
    if (isSvgFile(file) || hasKnownUnsupportedMime(file)) {
      return { ok: false, message: ERROR_MESSAGES.UNSUPPORTED_IMAGE_TYPE };
    }
  }

  return { ok: true };
}
