import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; expenseId: string }> },
) {
  const { tripId, expenseId } = await params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
    method: "GET",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; expenseId: string }> },
) {
  const { tripId, expenseId } = await params;
  const body = await request.text();
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
    method: "PATCH",
    body,
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; expenseId: string }> },
) {
  const { tripId, expenseId } = await params;
  const result = await protectedUpstreamCall({
    path: `/api/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
    method: "DELETE",
    authorization: request.headers.get("Authorization"),
  });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken, 204);
}
