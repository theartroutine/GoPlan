import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = { params: Promise<{ tripId: string; messageId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { tripId, messageId } = await context.params;
  const authorization = request.headers.get("Authorization");
  const body = await request.text();

  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/chat/messages/${encodeURIComponent(messageId)}/reactions`,
    method: "POST",
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
