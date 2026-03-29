import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = request.headers.get("Authorization");

  const result = await protectedUpstreamCall({
    path: `/api/friends/${id}`,
    method: "DELETE",
    authorization,
  });

  if (!result.ok) return result.response;

  return buildProtectedResponse(result.data, result.refreshedAccessToken, 204);
}
