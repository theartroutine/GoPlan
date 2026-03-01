const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_AUTH_ERROR_MARKER_COOKIE_NAME = "refresh_auth_error";
const REFRESH_AUTH_ERROR_MARKER_MAX_AGE_SECONDS = 45;

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
