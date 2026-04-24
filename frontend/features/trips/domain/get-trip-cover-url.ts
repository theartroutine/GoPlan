const DEFAULT_TRIP_COVER_URL = "/images/trip-cover-default.jpg";

export function getTripCoverUrl(coverImageUrl: string | null | undefined): string {
  if (!coverImageUrl) return DEFAULT_TRIP_COVER_URL;
  return coverImageUrl;
}

export { DEFAULT_TRIP_COVER_URL };

