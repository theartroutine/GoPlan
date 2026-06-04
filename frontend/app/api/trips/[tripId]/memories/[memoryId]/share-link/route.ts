import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string; memoryId: string }> };

function shareLinkPath(tripId: string, memoryId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/memories/${encodeURIComponent(memoryId)}/share-link`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { tripId, memoryId } = await context.params;
  const result = await protectedUpstreamCall({
    path: shareLinkPath(tripId, memoryId),
    method: "POST",
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
    path: shareLinkPath(tripId, memoryId),
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
