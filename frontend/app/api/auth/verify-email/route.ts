import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { clearRefreshAuthErrorMarker, setRefreshToken } from "@/app/api/auth/_lib/session-state";
import {
  asObject,
  callAuthUpstream,
  extractUserPayload,
  getBoolean,
  getString,
} from "@/app/api/auth/_lib/upstream";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?verify_error=invalid", request.url));
  }

  const upstream = await callAuthUpstream("/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }, request.headers);

  if (upstream.kind === "network_error") {
    return NextResponse.redirect(new URL("/login?verify_error=invalid", request.url));
  }

  if (!upstream.ok) {
    return NextResponse.redirect(new URL("/login?verify_error=invalid", request.url));
  }

  const payload = asObject(upstream.data);
  const tokens = asObject(payload?.tokens);
  const userObj = asObject(payload?.user);
  const userPayload = extractUserPayload(userObj);
  const accessToken = getString(tokens, "access");
  const refreshTokenValue = getString(tokens, "refresh");

  if (!userPayload || !accessToken || !refreshTokenValue) {
    return NextResponse.redirect(new URL("/login?verify_error=invalid", request.url));
  }

  const jar = await cookies();
  clearRefreshAuthErrorMarker(jar);
  setRefreshToken(jar, refreshTokenValue);

  const requiresProfileSetup = getBoolean(userObj, "requires_profile_setup");
  if (requiresProfileSetup) {
    return NextResponse.redirect(new URL("/setup-profile?verified=true", request.url));
  }

  return NextResponse.redirect(new URL("/?verified=true", request.url));
}
