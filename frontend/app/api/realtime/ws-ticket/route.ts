import type { NextRequest } from "next/server";

import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("Authorization");

  const result = await protectedUpstreamCall({
    path: "/api/realtime/ws-ticket",
    method: "POST",
    authorization,
  });

  if (!result.ok) return result.response;

  return buildProtectedResponse(result.data, result.refreshedAccessToken);
}
