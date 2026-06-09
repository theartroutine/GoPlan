import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshAuthErrorMarker,
  handleRefreshFailure,
  setNoStoreHeaders,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";

export async function POST() {
  const jar = await cookies();
  const sourceHeaders = await headers();
  const refreshTokenValue = jar.get(REFRESH_COOKIE_NAME)?.value;

  if (!refreshTokenValue) {
    clearRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: "No refresh token." },
      { status: 401 },
    );
  }

  const refreshResult = await refreshWithSingleFlight(
    refreshTokenValue,
    sourceHeaders,
  );

  const failureResponse = handleRefreshFailure(jar, refreshResult);
  if (failureResponse) return failureResponse;

  if (refreshResult.kind !== "success") return; // unreachable, satisfies TS

  clearRefreshAuthErrorMarker(jar);
  setRefreshToken(jar, refreshResult.refreshToken);

  return setNoStoreHeaders(
    NextResponse.json({ access_token: refreshResult.accessToken }),
  );
}
