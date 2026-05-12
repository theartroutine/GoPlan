import type { NextRequest } from "next/server";

import { buildProtectedResponse, protectedUpstreamCall } from "@/app/api/_lib/protected-upstream";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tripId: string; userId: string }> }) {
  const { tripId, userId } = await params;
  const authorization = request.headers.get("Authorization");
  const result = await protectedUpstreamCall({ path: `/api/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(userId)}`, method: "DELETE", authorization });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
