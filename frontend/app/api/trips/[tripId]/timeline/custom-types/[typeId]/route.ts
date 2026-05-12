import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; typeId: string }> }
) {
  const { tripId, typeId } = await params;
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/timeline/custom-types/${encodeURIComponent(typeId)}`,
    method: "PATCH",
    body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; typeId: string }> }
) {
  const { tripId, typeId } = await params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/timeline/custom-types/${encodeURIComponent(typeId)}`,
    method: "DELETE",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
