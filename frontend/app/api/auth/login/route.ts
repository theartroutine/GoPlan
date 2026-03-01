import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { clearRefreshAuthErrorMarker } from "@/app/api/auth/_lib/session-state";
import {
  asObject,
  callAuthUpstream,
  extractDetail,
  extractUserPayload,
  getString,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request payload." }, { status: 400 });
  }

  const upstream = await callAuthUpstream("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (upstream.kind === "network_error") {
    return NextResponse.json({ detail: upstream.detail }, { status: 503 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      normalizeErrorPayload(
        upstream.data,
        extractDetail(upstream.data, "Login failed. Please try again."),
      ),
      { status: upstream.status },
    );
  }

  const payload = asObject(upstream.data);
  const tokens = asObject(payload?.tokens);
  const userObj = asObject(payload?.user);
  const userPayload = extractUserPayload(userObj);
  const accessToken = getString(tokens, "access");
  const refreshToken = getString(tokens, "refresh");

  if (!userPayload || !accessToken || !refreshToken) {
    return NextResponse.json(
      { detail: "Invalid login response from auth service." },
      { status: 502 },
    );
  }

  const jar = await cookies();
  clearRefreshAuthErrorMarker(jar);

  jar.set("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({
    user: userPayload,
    access_token: accessToken,
  });
}
