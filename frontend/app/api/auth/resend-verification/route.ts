import { NextResponse, type NextRequest } from "next/server";

import {
  callAuthUpstream,
  extractDetail,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request payload." }, { status: 400 });
  }

  const upstream = await callAuthUpstream("/api/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, request.headers);

  if (upstream.kind === "network_error") {
    return NextResponse.json({ detail: upstream.detail }, { status: 503 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      normalizeErrorPayload(
        upstream.data,
        extractDetail(upstream.data, "Failed to resend verification email."),
      ),
      { status: upstream.status },
    );
  }

  return NextResponse.json(upstream.data);
}
