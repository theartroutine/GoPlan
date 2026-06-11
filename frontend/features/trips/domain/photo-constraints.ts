export const TRIP_PHOTO_MAX_FILES = 20;
export const TRIP_PHOTO_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const TRIP_PHOTO_MAX_TOTAL_UPLOAD_BYTES = 50 * 1024 * 1024;
export const TRIP_PHOTO_MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
export const TRIP_PHOTO_MAX_BODY_BYTES =
  TRIP_PHOTO_MAX_TOTAL_UPLOAD_BYTES + TRIP_PHOTO_MAX_MULTIPART_OVERHEAD_BYTES;

export const TRIP_PHOTO_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const TRIP_PHOTO_GENERIC_BINARY_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

type PhotoFileLike = Pick<File, "name" | "size" | "type">;

export function isTripPhotoSvgFile(file: PhotoFileLike): boolean {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

export function hasKnownUnsupportedTripPhotoMime(file: PhotoFileLike): boolean {
  return (
    file.type !== "" &&
    !TRIP_PHOTO_GENERIC_BINARY_TYPES.has(file.type) &&
    !TRIP_PHOTO_ALLOWED_TYPES.has(file.type)
  );
}

export function totalTripPhotoFileBytes(files: PhotoFileLike[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}
