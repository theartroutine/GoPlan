import {
  extractApiErrorMessage,
  getApiErrorCode,
  getApiErrorData,
} from "@/shared/http/api-errors";
import {
  TRIP_PHOTO_MAX_FILE_BYTES,
  TRIP_PHOTO_MAX_FILES,
  TRIP_PHOTO_MAX_TOTAL_UPLOAD_BYTES,
  hasKnownUnsupportedTripPhotoMime,
  isTripPhotoSvgFile,
  totalTripPhotoFileBytes,
} from "@/features/trips/domain/photo-constraints";

type PhotoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  NO_FILES: "Choose at least one photo.",
  PHOTO_DIMENSIONS_TOO_LARGE:
    "That photo is too large to process. Use an image under 45 megapixels.",
  PHOTO_INVALID_IMAGE:
    "That photo could not be processed. Choose a valid JPEG, PNG, or WebP file.",
  PHOTO_STORAGE_ERROR: "We could not save the photos. Please try again.",
  PHOTO_TOO_LARGE: "Each photo must be 10 MiB or smaller.",
  PHOTO_UPLOAD_TOO_LARGE: "Upload up to 50 MiB of photos at a time.",
  PHOTO_DELETE_FORBIDDEN: "You can only delete photos you uploaded unless you own the trip.",
  TOO_MANY_FILES: "Upload up to 20 photos at a time.",
  TRIP_TERMINAL: "Cancelled trips cannot change photos.",
  UNSUPPORTED_IMAGE_TYPE:
    "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.",
};

export function getTripPhotoErrorMessage(error: unknown, fallback: string): string {
  const code = getApiErrorCode(error);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  const detail = extractApiErrorMessage(getApiErrorData(error));
  return detail ?? fallback;
}

export function validateTripPhotoFiles(files: File[]): PhotoValidationResult {
  if (files.length === 0) {
    return { ok: false, message: ERROR_MESSAGES.NO_FILES };
  }
  if (files.length > TRIP_PHOTO_MAX_FILES) {
    return { ok: false, message: ERROR_MESSAGES.TOO_MANY_FILES };
  }
  if (totalTripPhotoFileBytes(files) > TRIP_PHOTO_MAX_TOTAL_UPLOAD_BYTES) {
    return { ok: false, message: ERROR_MESSAGES.PHOTO_UPLOAD_TOO_LARGE };
  }

  for (const file of files) {
    if (file.size > TRIP_PHOTO_MAX_FILE_BYTES) {
      return { ok: false, message: ERROR_MESSAGES.PHOTO_TOO_LARGE };
    }
    if (isTripPhotoSvgFile(file) || hasKnownUnsupportedTripPhotoMime(file)) {
      return { ok: false, message: ERROR_MESSAGES.UNSUPPORTED_IMAGE_TYPE };
    }
  }

  return { ok: true };
}
