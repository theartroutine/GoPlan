const DEFAULT_TRIP_COVER_URL = "/images/trip-cover-default.jpg";
const TRIP_COVER_URL_PATTERN =
  /^\/media\/trip-covers\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i;

export function getTripCoverUrl(coverImageUrl: string | null | undefined): string {
  const normalized = coverImageUrl?.trim();
  if (!normalized || !TRIP_COVER_URL_PATTERN.test(normalized)) {
    return DEFAULT_TRIP_COVER_URL;
  }
  return normalized;
}

export { DEFAULT_TRIP_COVER_URL };
