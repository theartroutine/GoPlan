import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/expenses`,
    method: "GET",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/expenses`,
    method: "POST",
    body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken, 201);
}
