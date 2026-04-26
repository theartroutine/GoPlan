import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; activityId: string }> }
) {
  const { tripId, activityId } = await params;
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${tripId}/timeline/activities/${activityId}`,
    method: "PATCH",
    body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; activityId: string }> }
) {
  const { tripId, activityId } = await params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${tripId}/timeline/activities/${activityId}`,
    method: "DELETE",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
