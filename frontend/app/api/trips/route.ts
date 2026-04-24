import type { NextRequest } from "next/server";

import { normalizeCursorPaginatedResponse } from "@/app/api/_lib/pagination";
import {
  buildProtectedResponse,
  protectedUpstreamCall,
} from "@/app/api/_lib/protected-upstream";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("Authorization");
  const query = request.nextUrl.searchParams.toString();

  const result = await protectedUpstreamCall({
    path: "/api/trips/",
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

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("Authorization");
  const body = await request.text();

  const result = await protectedUpstreamCall({
    path: "/api/trips/",
    method: "POST",
    authorization,
    body,
  });

  if (!result.ok) return result.response;
  return buildProtectedResponse(result.data, result.refreshedAccessToken, 201);
}
