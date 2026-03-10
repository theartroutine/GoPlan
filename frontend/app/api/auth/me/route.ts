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
  asObject,
  callAuthUpstream,
  extractDetail,
  extractUserPayload,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

export async function GET() {
  const jar = await cookies();
  const refreshTokenValue = jar.get(REFRESH_COOKIE_NAME)?.value;

  if (!refreshTokenValue) {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: "Not authenticated." },
      { status: 401 },
    );
  }

  const refreshResult = await refreshWithSingleFlight(refreshTokenValue);

  const failureResponse = handleRefreshFailure(jar, refreshResult);
  if (failureResponse) return failureResponse;

  if (refreshResult.kind !== "success") return; // unreachable, satisfies TS

  const meUpstream = await callAuthUpstream("/api/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${refreshResult.accessToken}`,
    },
  });

  if (meUpstream.kind === "network_error") {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json({ detail: meUpstream.detail }, { status: 503 });
  }

  if (!meUpstream.ok) {
    if (meUpstream.status === 401 || meUpstream.status === 403) {
      clearRefreshSession(jar);
      return NextResponse.json(
        { detail: "Session expired.", code: HARD_AUTH_ERROR_CODE },
        { status: 401 },
      );
    }

    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      normalizeErrorPayload(
        meUpstream.data,
        extractDetail(meUpstream.data, "Unable to load authenticated user."),
      ),
      { status: meUpstream.status },
    );
  }

  const payload = asObject(meUpstream.data);
  const userObj = asObject(payload?.user);
  const userPayload = extractUserPayload(userObj);
  if (!userPayload) {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: "Invalid user payload from auth service." },
      { status: 502 },
    );
  }

  clearRefreshAuthErrorMarker(jar);
  setRefreshToken(jar, refreshResult.refreshToken);

  return NextResponse.json({
    user: userPayload,
    access_token: refreshResult.accessToken,
  });
}
