import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId } = await context.params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/memories/create-options`,
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
