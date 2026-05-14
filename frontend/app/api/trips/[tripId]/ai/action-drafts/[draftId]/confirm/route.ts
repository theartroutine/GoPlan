import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string; draftId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { tripId, draftId } = await context.params;
  const authorization = request.headers.get("Authorization");

  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/ai/action-drafts/${encodeURIComponent(draftId)}/confirm`,
    method: "POST",
    authorization,
  });

  if (!result.ok) return result.response;
  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}
