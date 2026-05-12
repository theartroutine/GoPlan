import type { NextRequest } from "next/server";
import { buildProtectedResponse, protectedUpstreamCall } from "@/app/api/_lib/protected-upstream";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invId: string }> }) {
  const { invId } = await params;
  const authorization = request.headers.get("Authorization");
  const result = await protectedUpstreamCall({ path: `/api/invitations/${encodeURIComponent(invId)}/accept`, method: "POST", authorization });
  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
