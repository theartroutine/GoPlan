import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { protectedUpstreamCall } from "@/app/api/_lib/protected-upstream";
import {
  clearRefreshAuthErrorMarker,
  setNoStoreHeaders,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import {
  asObject,
  extractUserPayload,
  getString,
} from "@/app/api/auth/_lib/upstream";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request payload." }, { status: 400 });
  }

  const upstream = await protectedUpstreamCall({
    path: "/api/auth/password/change",
    method: "POST",
    body: JSON.stringify(body),
    authorization: request.headers.get("Authorization"),
  });

  if (!upstream.ok) {
    return upstream.response;
  }

  const payload = asObject(upstream.data);
  const tokens = asObject(payload?.tokens);
  const userObj = asObject(payload?.user);
  const userPayload = extractUserPayload(userObj);
  const accessToken = getString(tokens, "access");
  const refreshTokenValue = getString(tokens, "refresh");

  if (!userPayload || !accessToken || !refreshTokenValue) {
    return NextResponse.json(
      { detail: "Invalid response from auth service." },
      { status: 502 },
    );
  }

  const jar = await cookies();
  clearRefreshAuthErrorMarker(jar);
  setRefreshToken(jar, refreshTokenValue);

  return setNoStoreHeaders(
    NextResponse.json({
      user: userPayload,
      access_token: accessToken,
    }),
  );
}
