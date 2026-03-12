import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { clearRefreshSession } from "@/app/api/auth/_lib/session-state";
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

  const upstream = await callAuthUpstream("/api/auth/password-reset/confirm", {
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
        extractDetail(upstream.data, "Failed to reset password."),
      ),
      { status: upstream.status },
    );
  }

  // Clean up refresh cookie since all sessions are revoked after password reset
  const jar = await cookies();
  clearRefreshSession(jar);

  return NextResponse.json(upstream.data);
}
