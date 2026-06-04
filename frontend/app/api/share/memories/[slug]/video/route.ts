import type { NextRequest } from "next/server";

import { proxyPublicVideoStream } from "@/app/api/_lib/video-stream-proxy";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const upstreamPath = `/api/public/memories/${encodeURIComponent(slug)}/video`;
  return proxyPublicVideoStream({
    request,
    upstreamPath,
    fallbackDetail: "Public memory video request failed.",
  });
}
