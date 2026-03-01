import { NextResponse, type NextRequest } from "next/server";

import {
  asObject,
  callAuthUpstream,
  extractUserPayload,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return NextResponse.json(
      { detail: "Authorization header is required." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request payload." },
      { status: 400 },
    );
  }

  const upstream = await callAuthUpstream("/api/auth/profile/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify(body),
  });

  if (upstream.kind === "network_error") {
    return NextResponse.json({ detail: upstream.detail }, { status: 503 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      normalizeErrorPayload(
        upstream.data,
        "Profile setup failed. Please try again.",
      ),
      { status: upstream.status },
    );
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

  return NextResponse.json({ user: userPayload });
}
