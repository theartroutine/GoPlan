import { NextResponse, type NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";
import {
  asObject,
  extractUserPayload,
} from "@/app/api/auth/_lib/upstream";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request payload." },
      { status: 400 },
    );
  }

  const upstream = await protectedUpstreamCall({
    path: "/api/auth/profile/setup",
    method: "POST",
    body: JSON.stringify(body),
    authorization: request.headers.get("Authorization"),
  });

  if (!upstream.ok) {
    return upstream.response;
  }

  const payload = asObject(upstream.data);
  const userObj = asObject(payload?.user);
  const userPayload = extractUserPayload(userObj);

  if (!userPayload) {
    return NextResponse.json(
      { detail: "Invalid profile setup response from auth service." },
      { status: 502 },
    );
  }

  return buildProtectedResponse({ user: userPayload }, upstream.refreshedAccessToken);
}
