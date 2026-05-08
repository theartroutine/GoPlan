import { NextResponse, type NextRequest } from "next/server";

import {
  asObject,
  callAuthUpstream,
  extractDetail,
  getString,
  normalizeErrorPayload,
} from "@/app/api/auth/_lib/upstream";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request payload." }, { status: 400 });
  }

  const upstream = await callAuthUpstream("/api/auth/register", {
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
        extractDetail(upstream.data, "Registration failed. Please try again."),
      ),
      { status: upstream.status },
    );
  }

  const payload = asObject(upstream.data);
  const detail = getString(payload, "detail");

  if (!detail) {
    return NextResponse.json(
      { detail: "Invalid register response from auth service." },
      { status: 502 },
    );
  }

  return NextResponse.json({ detail }, { status: upstream.status });
}
