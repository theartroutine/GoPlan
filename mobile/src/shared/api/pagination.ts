export interface CursorPaginatedResponse<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function extractCursor(url: string | null): string | null {
  if (!url) {
    return null;
  }

  const match = /[?&]cursor=([^&#]*)/.exec(url);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function toCursorPage<T>(response: CursorPaginatedResponse<T>): CursorPage<T> {
  return {
    items: response.results,
    nextCursor: extractCursor(response.next),
  };
}
