import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId } = await context.params;
  const query = request.nextUrl.searchParams.toString();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/memories/status`,
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
