type HereLocationSearchEnv = Partial<{
  ENABLE_HERE_LOCATION_SEARCH: string;
  HERE_API_KEY: string;
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
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 30;
const DEFAULT_SUGGEST_CACHE_TTL_MS = 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const WARN_THRESHOLD = 0.8;

const hereLocationSearchCache = new Map<string, CacheEntry<unknown>>();
const hereLocationSearchRequests: number[] = [];

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
  while (
    hereLocationSearchRequests.length > 0 &&
    now - hereLocationSearchRequests[0] >= RATE_LIMIT_WINDOW_MS
  ) {
    hereLocationSearchRequests.shift();
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

export function consumeHereLocationSearchSlot({
  env = process.env,
  now = Date.now(),
}: ConsumeHereLocationSearchSlotArgs = {}) {
  pruneRateLimitWindow(now);

  const maxRequests = parsePositiveInteger(
    env.HERE_LOCATION_SEARCH_MAX_REQUESTS_PER_MINUTE,
    DEFAULT_MAX_REQUESTS_PER_MINUTE,
  );

  if (hereLocationSearchRequests.length >= maxRequests) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - hereLocationSearchRequests[0]);

    console.warn(
      `[HERE] blocked request after reaching ${maxRequests} requests in the last minute.`,
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    };
  }

  hereLocationSearchRequests.push(now);

  if (hereLocationSearchRequests.length >= Math.ceil(maxRequests * WARN_THRESHOLD)) {
    console.warn(
      `[HERE] local usage is high: ${hereLocationSearchRequests.length}/${maxRequests} requests in the last minute.`,
    );
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - hereLocationSearchRequests.length),
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
  hereLocationSearchCache.set(key, {
    expiresAt: now + ttlMs,
    value,
  });
}

export function resetHereLocationSearchStateForTests() {
  hereLocationSearchCache.clear();
  hereLocationSearchRequests.length = 0;
}
