import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string; memoryId: string }> };

function memoryPath(tripId: string, memoryId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories/${encodeURIComponent(memoryId)}`;
}

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
  const { tripId, memoryId } = await context.params;
  const result = await protectedUpstreamCall({
    path: memoryPath(tripId, memoryId),
    method: "GET",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const { tripId, memoryId } = await context.params;
  const result = await protectedUpstreamCall({
    path: memoryPath(tripId, memoryId),
    method: "PATCH",
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { tripId, memoryId } = await context.params;
  const result = await protectedUpstreamCall({
    path: memoryPath(tripId, memoryId),
    method: "DELETE",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}
