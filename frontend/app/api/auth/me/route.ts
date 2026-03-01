import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  HARD_AUTH_ERROR_CODE,
  SOFT_AUTH_ERROR_CODE,
  clearRefreshAuthErrorMarker,
  clearRefreshSession,
  hasRefreshAuthErrorMarker,
  setRefreshAuthErrorMarker,
} from "@/app/api/auth/_lib/session-state";
import {
  asObject,
  callAuthUpstream,
  extractDetail,
  extractUserPayload,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function GET() {
  const jar = await cookies();
  const refreshToken = jar.get("refresh_token")?.value;

  if (!refreshToken) {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: "Not authenticated." },
      { status: 401 },
    );
  }

  const refreshResult = await refreshWithSingleFlight(refreshToken);

  if (refreshResult.kind === "auth_error") {
    if (hasRefreshAuthErrorMarker(jar)) {
      clearRefreshSession(jar);
      return NextResponse.json(
        {
          detail: "Session expired.",
          code: HARD_AUTH_ERROR_CODE,
        },
        { status: 401 },
      );
    }

    setRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      {
        detail: refreshResult.detail,
        code: SOFT_AUTH_ERROR_CODE,
      },
      { status: 401 },
    );
  }

  if (refreshResult.kind === "transient_error") {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: refreshResult.detail },
      { status: refreshResult.status },
    );
  }

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
        {
          detail: "Session expired.",
          code: HARD_AUTH_ERROR_CODE,
        },
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
  jar.set("refresh_token", refreshResult.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({
    user: userPayload,
    access_token: refreshResult.accessToken,
  });
}
