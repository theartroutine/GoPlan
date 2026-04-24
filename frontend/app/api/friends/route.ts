import type { NextRequest } from "next/server";

import { normalizeCursorPaginatedResponse } from "@/app/api/_lib/pagination";
import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("Authorization");
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.toString();

  const result = await protectedUpstreamCall({
    path: "/api/friends/",
    method: "GET",
    authorization,
    query: query || undefined,
  });

  if (!result.ok) return result.response;

  return buildProtectedResponse(
    normalizeCursorPaginatedResponse(result.data),
    result.refreshedAccessToken,
  );
}
