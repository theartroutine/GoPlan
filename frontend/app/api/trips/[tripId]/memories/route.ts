import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string }> };

async function readJsonBody(request: NextRequest): Promise<
  | { ok: true; body: string }
  | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, body: JSON.stringify(await request.json()) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Invalid request body." },
        { status: 400 },
      ),
    };
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId } = await context.params;
  const query = request.nextUrl.searchParams.toString();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/memories`,
    method: "GET",
    query: query || undefined,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const { tripId } = await context.params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/memories`,
    method: "POST",
    body: bodyResult.body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}
