type HereLocationSearchEnv = Partial<{
  ENABLE_HERE_LOCATION_SEARCH: string;
  HERE_API_KEY: string;
  HERE_LOCATION_SEARCH_CACHE_MAX_ENTRIES: string;
  HERE_LOCATION_SEARCH_FETCH_TIMEOUT_MS: string;
  HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_MS: string;
  HERE_LOCATION_SEARCH_MAX_REQUESTS_PER_MINUTE: string;
  HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_MS: string;
  NODE_ENV: string;
}>;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type ConsumeHereLocationSearchSlotArgs = {
  bucketKey?: string;
  env?: HereLocationSearchEnv;
  now?: number;
};

type WriteHereLocationSearchCacheArgs<T> = {
  key: string;
  now?: number;
  ttlMs: number;
  value: T;
};

type ReadHereLocationSearchCacheArgs = {
  key: string;
  now?: number;
};

const DEFAULT_LOOKUP_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 30;
const DEFAULT_SUGGEST_CACHE_TTL_MS = 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const WARN_THRESHOLD = 0.8;

const hereLocationSearchCache = new Map<string, CacheEntry<unknown>>();
const hereLocationSearchRequestsByBucket = new Map<string, number[]>();

function isTruthy(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pruneExpiredCache(now: number) {
  for (const [key, entry] of hereLocationSearchCache.entries()) {
    if (entry.expiresAt <= now) {
      hereLocationSearchCache.delete(key);
    }
  }
}

function pruneRateLimitWindow(now: number) {
  for (const [bucketKey, requests] of hereLocationSearchRequestsByBucket) {
    while (
      requests.length > 0 &&
      now - requests[0] >= RATE_LIMIT_WINDOW_MS
    ) {
      requests.shift();
    }

    if (requests.length === 0) {
      hereLocationSearchRequestsByBucket.delete(bucketKey);
    }
  }
}

export function getHereLocationSearchAvailability(env: HereLocationSearchEnv = process.env) {
  if (env.NODE_ENV === "production") {
    return {
      detail: "HERE location search is disabled in production.",
      enabled: false,
    };
  }

  if (!isTruthy(env.ENABLE_HERE_LOCATION_SEARCH)) {
    return {
      detail: "HERE location search is disabled.",
      enabled: false,
    };
  }

  if (!env.HERE_API_KEY) {
    return {
      detail: "Location search is not configured.",
      enabled: false,
    };
  }

  return {
    detail: "HERE location search is enabled.",
    enabled: true,
  };
}

export function getHereLocationSearchSuggestCacheTtlMs(
  env: HereLocationSearchEnv = process.env,
): number {
  return parsePositiveInteger(
    env.HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_MS,
    DEFAULT_SUGGEST_CACHE_TTL_MS,
  );
}

export function getHereLocationSearchLookupCacheTtlMs(
  env: HereLocationSearchEnv = process.env,
): number {
  return parsePositiveInteger(
    env.HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_MS,
    DEFAULT_LOOKUP_CACHE_TTL_MS,
  );
}

export function getHereLocationSearchFetchTimeoutMs(
  env: HereLocationSearchEnv = process.env,
): number {
  return parsePositiveInteger(
    env.HERE_LOCATION_SEARCH_FETCH_TIMEOUT_MS,
    DEFAULT_FETCH_TIMEOUT_MS,
  );
}

function getHereLocationSearchCacheMaxEntries(
  env: HereLocationSearchEnv = process.env,
): number {
  return parsePositiveInteger(
    env.HERE_LOCATION_SEARCH_CACHE_MAX_ENTRIES,
    DEFAULT_CACHE_MAX_ENTRIES,
  );
}

export function consumeHereLocationSearchSlot({
  bucketKey = "anonymous",
  env = process.env,
  now = Date.now(),
}: ConsumeHereLocationSearchSlotArgs = {}) {
  pruneRateLimitWindow(now);
  const requests = hereLocationSearchRequestsByBucket.get(bucketKey) ?? [];
  hereLocationSearchRequestsByBucket.set(bucketKey, requests);

  const maxRequests = parsePositiveInteger(
    env.HERE_LOCATION_SEARCH_MAX_REQUESTS_PER_MINUTE,
    DEFAULT_MAX_REQUESTS_PER_MINUTE,
  );

  if (requests.length >= maxRequests) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - requests[0]);

    console.warn(
      `[HERE] blocked request for ${bucketKey} after reaching ${maxRequests} requests in the last minute.`,
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    };
  }

  requests.push(now);

  if (requests.length >= Math.ceil(maxRequests * WARN_THRESHOLD)) {
    console.warn(
      `[HERE] local usage is high for ${bucketKey}: ${requests.length}/${maxRequests} requests in the last minute.`,
    );
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - requests.length),
    retryAfterSeconds: 0,
  };
}

export function readHereLocationSearchCache<T>({
  key,
  now = Date.now(),
}: ReadHereLocationSearchCacheArgs): T | null {
  pruneExpiredCache(now);

  const entry = hereLocationSearchCache.get(key);
  if (!entry) {
    return null;
  }

  return entry.value as T;
}

export function writeHereLocationSearchCache<T>({
  key,
  now = Date.now(),
  ttlMs,
  value,
}: WriteHereLocationSearchCacheArgs<T>) {
  pruneExpiredCache(now);
  const maxEntries = getHereLocationSearchCacheMaxEntries();
  while (hereLocationSearchCache.size >= maxEntries) {
    const oldestKey = hereLocationSearchCache.keys().next().value;
    if (!oldestKey) break;
    hereLocationSearchCache.delete(oldestKey);
  }

  hereLocationSearchCache.set(key, {
    expiresAt: now + ttlMs,
    value,
  });
}

export function resetHereLocationSearchStateForTests() {
  hereLocationSearchCache.clear();
  hereLocationSearchRequestsByBucket.clear();
}
