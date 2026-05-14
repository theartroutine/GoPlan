import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string; draftId: string }> };

function draftPath(tripId: string, draftId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/ai/action-drafts/${encodeURIComponent(draftId)}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId, draftId } = await context.params;
  const authorization = request.headers.get("Authorization");

  const result = await protectedUpstreamCall({
    path: draftPath(tripId, draftId),
    method: "GET",
    authorization,
  });

  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { tripId, draftId } = await context.params;
  const authorization = request.headers.get("Authorization");
  const body = await request.text();

  const result = await protectedUpstreamCall({
    path: draftPath(tripId, draftId),
    method: "PATCH",
    body,
    authorization,
  });

  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}
