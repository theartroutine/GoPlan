export const GOPLAN_CLIENT_IP_HEADER = "X-GoPlan-Client-IP";
export const GOPLAN_INTERNAL_PROXY_SECRET_HEADER =
  "X-GoPlan-Internal-Proxy-Secret";

function normalizeHeaderValue(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || /[\r\n]/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function firstForwardedFor(value: string | null): string | null {
  if (!value) return null;
  return normalizeHeaderValue(value.split(",")[0] ?? null);
}

function getSourceClientIp(sourceHeaders?: Headers | null): string | null {
  if (!sourceHeaders) return null;

  return (
    normalizeHeaderValue(sourceHeaders.get("CF-Connecting-IP")) ??
    normalizeHeaderValue(sourceHeaders.get("X-Real-IP")) ??
    firstForwardedFor(sourceHeaders.get("X-Forwarded-For"))
  );
}

export function buildTrustedClientHeaders(
  sourceHeaders?: Headers | null,
): Record<string, string> {
  const proxySecret = process.env.GOPLAN_INTERNAL_PROXY_SECRET?.trim();
  const clientIp = getSourceClientIp(sourceHeaders);

  if (!proxySecret || !clientIp) return {};

  return {
    [GOPLAN_CLIENT_IP_HEADER]: clientIp,
    [GOPLAN_INTERNAL_PROXY_SECRET_HEADER]: proxySecret,
  };
}

export function mergeHeadersWithTrustedClient(
  headersInit: HeadersInit | undefined,
  sourceHeaders?: Headers | null,
): HeadersInit {
  const trustedClientHeaders = buildTrustedClientHeaders(sourceHeaders);
  if (Object.keys(trustedClientHeaders).length === 0) {
    return headersInit ?? {};
  }

  if (!headersInit || (!Array.isArray(headersInit) && !(headersInit instanceof Headers))) {
    return {
      ...(headersInit as Record<string, string> | undefined),
      ...trustedClientHeaders,
    };
  }

  const headers = new Headers(headersInit);
  for (const [name, value] of Object.entries(trustedClientHeaders)) {
    headers.set(name, value);
  }
  return headers;
}
