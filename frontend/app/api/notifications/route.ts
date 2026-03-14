import type { NextRequest } from "next/server";

import { normalizePaginatedResponse } from "@/app/api/_lib/pagination";
import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function GET(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor");
  const authorization = request.headers.get("Authorization");

  const result = await protectedUpstreamCall({
    path: "/api/notifications/",
    method: "GET",
    query: cursor ? `cursor=${cursor}` : undefined,
    authorization,
  });

  if (!result.ok) return result.response;

  return buildProtectedResponse(
    normalizePaginatedResponse(result.data),
    result.refreshedAccessToken,
  );
}
