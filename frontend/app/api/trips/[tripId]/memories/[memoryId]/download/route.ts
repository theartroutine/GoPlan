import type { NextRequest } from "next/server";

import { proxyProtectedVideoStream } from "@/app/api/_lib/video-stream-proxy";

type RouteContext = { params: Promise<{ tripId: string; memoryId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId, memoryId } = await context.params;
  const upstreamPath = `/api/trips/${encodeURIComponent(tripId)}/memories/${encodeURIComponent(memoryId)}/download`;
  return proxyProtectedVideoStream({
    request,
    upstreamPath,
    fallbackDetail: "Memory video download failed.",
  });
}
