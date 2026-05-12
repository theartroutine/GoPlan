import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

type RouteContext = {
  params: Promise<{ tripId: string; messageId: string; emoji: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { tripId, messageId, emoji } = await context.params;
  const authorization = request.headers.get("Authorization");

  // Next.js URL-decodes dynamic segments automatically; re-encode for upstream.
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/chat/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    method: "DELETE",
    authorization,
  });

  if (!result.ok) return result.response;

  return buildProtectedResponse(
    result.data,
    result.refreshedAccessToken,
    result.status,
  );
}
