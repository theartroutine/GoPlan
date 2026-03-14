/**
 * Extract cursor value from DRF CursorPagination URL.
 * Input: "http://backend:8000/api/notifications/?cursor=cD0yMDI2..." or null
 * Output: "cD0yMDI2..." or null
 */
export function extractCursor(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("cursor");
  } catch {
    return null;
  }
}

/**
 * Normalize DRF paginated response for BFF output.
 * Replaces next/previous URLs with cursor-only values.
 */
export function normalizePaginatedResponse(data: unknown) {
  const obj = data as Record<string, unknown>;
  return {
    results: obj.results,
    next_cursor: extractCursor(obj.next as string | null),
    previous_cursor: extractCursor(obj.previous as string | null),
  };
}

/**
 * Strip next/previous URLs from DRF LimitOffsetPagination response.
 * Returns {count, results} — frontend manages offset/limit directly.
 */
export function stripPaginationUrls(data: unknown) {
  const obj = data as Record<string, unknown>;
  return {
    count: obj.count,
    results: obj.results,
  };
}
