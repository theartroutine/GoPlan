import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; expenseId: string; userId: string }> },
) {
  const { tripId, expenseId, userId } = await params;
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}/contributions/${encodeURIComponent(userId)}`,
    method: "PATCH",
    body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
