import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; transferId: string }> },
) {
  const { tripId, transferId } = await params;
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${tripId}/settlement/transfers/${transferId}/sent`,
    method: "POST",
    body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
