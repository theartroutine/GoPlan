import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const authorization = request.headers.get("Authorization");
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}`,
    method: "GET",
    authorization,
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const authorization = request.headers.get("Authorization");
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}`,
    method: "PATCH",
    authorization,
    body,
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
