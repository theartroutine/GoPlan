import { NextResponse } from "next/server";

export const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_AUTH_ERROR_MARKER_COOKIE_NAME = "refresh_auth_error";
const REFRESH_AUTH_ERROR_MARKER_MAX_AGE_SECONDS = 45;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

type CookieStore = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      path?: string;
      maxAge?: number;
      secure?: boolean;
    },
  ): void;
  delete(name: string): void;
};

export const SOFT_AUTH_ERROR_CODE = "refresh_auth_soft_failed";
export const HARD_AUTH_ERROR_CODE = "session_expired";

export function hasRefreshAuthErrorMarker(jar: CookieStore): boolean {
  return jar.get(REFRESH_AUTH_ERROR_MARKER_COOKIE_NAME)?.value === "1";
}

export function setRefreshAuthErrorMarker(jar: CookieStore): void {
  jar.set(REFRESH_AUTH_ERROR_MARKER_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_AUTH_ERROR_MARKER_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearRefreshAuthErrorMarker(jar: CookieStore): void {
  jar.delete(REFRESH_AUTH_ERROR_MARKER_COOKIE_NAME);
}

export function clearRefreshSession(jar: CookieStore): void {
  jar.delete(REFRESH_COOKIE_NAME);
  clearRefreshAuthErrorMarker(jar);
}

export function setRefreshToken(jar: CookieStore, token: string): void {
  jar.set(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export function setNoStoreHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

type RefreshResult =
  | { kind: "success"; accessToken: string; refreshToken: string }
  | { kind: "auth_error"; detail: string }
  | { kind: "transient_error"; detail: string; status: number };

export function handleRefreshFailure(
  jar: CookieStore,
  refreshResult: RefreshResult,
): NextResponse | null {
  if (refreshResult.kind === "auth_error") {
    if (hasRefreshAuthErrorMarker(jar)) {
      clearRefreshSession(jar);
      return NextResponse.json(
        { detail: "Session expired.", code: HARD_AUTH_ERROR_CODE },
        { status: 401 },
      );
    }

    setRefreshAuthErrorMarker(jar);
    return NextResponse.json(
      { detail: refreshResult.detail, code: SOFT_AUTH_ERROR_CODE },
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

  return null;
}
