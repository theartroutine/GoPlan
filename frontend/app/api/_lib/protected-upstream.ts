import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  HARD_AUTH_ERROR_CODE,
  REFRESH_COOKIE_NAME,
  clearRefreshAuthErrorMarker,
  clearRefreshSession,
  handleRefreshFailure,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import {
  callAuthUpstream,
  extractDetail,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

type ProtectedCallOptions = {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: string;
  query?: string;
  authorization?: string | null;
};

type ProtectedCallSuccess = {
  ok: true;
  data: unknown;
  status: number;
  refreshedAccessToken?: string;
};

type ProtectedCallFailure = {
  ok: false;
  response: NextResponse;
};

export type ProtectedCallResult = ProtectedCallSuccess | ProtectedCallFailure;

function buildProtectedErrorResponse(
  data: unknown,
  status: number,
  upstreamHeaders?: Headers,
): NextResponse {
  const response = NextResponse.json(data, { status });
  const retryAfter = upstreamHeaders?.get("Retry-After");
  if (retryAfter) {
    response.headers.set("Retry-After", retryAfter);
  }
  return response;
}

export async function protectedUpstreamCall(
  options: ProtectedCallOptions,
): Promise<ProtectedCallResult> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;

  const fullPath = options.query
    ? `${options.path}?${options.query}`
    : options.path;

  const buildHeaders = (token: string): Record<string, string> => {
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (options.body) h["Content-Type"] = "application/json";
    return h;
  };

  // Attempt 1: Use client's access token if available
  if (options.authorization) {
    const upstream = await callAuthUpstream(fullPath, {
      method: options.method,
      headers: {
        ...buildHeaders(""),
        Authorization: options.authorization,
      },
      body: options.body,
    });

    if (upstream.kind !== "network_error" && upstream.ok) {
      clearRefreshAuthErrorMarker(jar);
      return { ok: true, data: upstream.data, status: upstream.status };
    }

    if (upstream.kind === "network_error") {
      clearRefreshAuthErrorMarker(jar);
      return {
        ok: false,
        response: NextResponse.json(
          { detail: upstream.detail },
          { status: 503 },
        ),
      };
    }

    if (upstream.status !== 401) {
      clearRefreshAuthErrorMarker(jar);
      return {
        ok: false,
        response: buildProtectedErrorResponse(
          normalizeErrorPayload(
            upstream.data,
            extractDetail(upstream.data, "Request failed."),
          ),
          upstream.status,
          upstream.headers,
        ),
      };
    }
    // 401 → fall through to refresh
  }

  // Attempt 2: Refresh token → get new access token → retry
  if (!refreshToken) {
    clearRefreshAuthErrorMarker(jar);
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Not authenticated." },
        { status: 401 },
      ),
    };
  }

  const refreshResult = await refreshWithSingleFlight(refreshToken);
  const failureResponse = handleRefreshFailure(jar, refreshResult);
  if (failureResponse) return { ok: false, response: failureResponse };

  if (refreshResult.kind !== "success") {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Auth failed." },
        { status: 401 },
      ),
    };
  }

  setRefreshToken(jar, refreshResult.refreshToken);

  const retryUpstream = await callAuthUpstream(fullPath, {
    method: options.method,
    headers: buildHeaders(refreshResult.accessToken),
    body: options.body,
  });

  if (retryUpstream.kind === "network_error") {
    clearRefreshAuthErrorMarker(jar);
    return {
      ok: false,
      response: NextResponse.json(
        { detail: retryUpstream.detail },
        { status: 503 },
      ),
    };
  }

  if (!retryUpstream.ok) {
    if (retryUpstream.status === 401) {
      clearRefreshSession(jar);
      return {
        ok: false,
        response: NextResponse.json(
          { detail: "Session expired.", code: HARD_AUTH_ERROR_CODE },
          { status: 401 },
        ),
      };
    }

    clearRefreshAuthErrorMarker(jar);
    return {
      ok: false,
      response: buildProtectedErrorResponse(
        normalizeErrorPayload(
          retryUpstream.data,
          extractDetail(retryUpstream.data, "Request failed."),
        ),
        retryUpstream.status,
        retryUpstream.headers,
      ),
    };
  }

  clearRefreshAuthErrorMarker(jar);
  return {
    ok: true,
    data: retryUpstream.data,
    status: retryUpstream.status,
    refreshedAccessToken: refreshResult.accessToken,
  };
}

/**
 * Wrap response data as NextResponse, attaching X-Access-Token header if BFF refreshed.
 * Safe for no-body status codes (204, 205) — uses `new NextResponse(null)` instead of `.json()`.
 */
const NO_BODY_STATUS_CODES = new Set([204, 205]);

export function buildProtectedResponse(
  data: unknown,
  refreshedAccessToken?: string,
  status = 200,
): NextResponse {
  const response = NO_BODY_STATUS_CODES.has(status)
    ? new NextResponse(null, { status })
    : NextResponse.json(data, { status });
  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
  }
  return response;
}
