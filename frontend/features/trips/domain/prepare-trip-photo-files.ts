import {
  preprocessImageFile,
  type PreprocessResult,
  type PreprocessTarget,
} from "@/shared/lib/image-preprocess";

import { TRIP_PHOTO_MAX_FILE_BYTES } from "@/features/trips/domain/photo-constraints";
import { validateTripPhotoFiles } from "@/features/trips/domain/photo-errors";

/** Mirrors backend TRIP_PHOTO_MEDIUM_MAX_EDGE — the largest variant the server keeps. */
export const TRIP_PHOTO_PREPROCESS_TARGET: PreprocessTarget = {
  maxEdgePx: 2560,
  maxBytes: TRIP_PHOTO_MAX_FILE_BYTES,
};

export const PHOTO_UNREADABLE_MESSAGE =
  "Could not read this photo. Convert it to JPEG and try again.";
const PHOTO_UNSUPPORTED_MESSAGE =
  "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.";

export type PrepareTripPhotosResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };

type PreprocessFn = (file: File, target: PreprocessTarget) => Promise<PreprocessResult>;

/**
 * Normalize selected files (HEIC decode, downscale, WebP re-encode) one at a
 * time to bound memory, then run the existing count/total-size validation on
 * the processed output.
 */
export async function prepareTripPhotoFiles(
  files: File[],
  preprocess: PreprocessFn = preprocessImageFile,
): Promise<PrepareTripPhotosResult> {
  const processed: File[] = [];
  for (const file of files) {
    const result = await preprocess(file, TRIP_PHOTO_PREPROCESS_TARGET);
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.code === "UNSUPPORTED" ? PHOTO_UNSUPPORTED_MESSAGE : PHOTO_UNREADABLE_MESSAGE,
      };
    }
    processed.push(result.file);
  }

  const validation = validateTripPhotoFiles(processed);
  if (!validation.ok) return validation;
  return { ok: true, files: processed };
}
