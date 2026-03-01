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

const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get("refresh_token")?.value;

  if (!refreshToken) {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: "No refresh token." },
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

  clearRefreshAuthErrorMarker(jar);
  jar.set("refresh_token", refreshResult.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ access_token: refreshResult.accessToken });
}
