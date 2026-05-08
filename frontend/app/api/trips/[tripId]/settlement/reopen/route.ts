import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${tripId}/settlement/reopen`,
    method: "POST",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
