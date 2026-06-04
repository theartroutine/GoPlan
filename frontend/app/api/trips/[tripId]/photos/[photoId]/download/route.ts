import type { NextRequest } from "next/server";

import { proxyTripPhotoDownload } from "@/app/api/trips/[tripId]/photos/_lib/photo-asset-proxy";

type RouteContext = { params: Promise<{ tripId: string; photoId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { tripId, photoId } = await context.params;
  return proxyTripPhotoDownload({ request, tripId, photoId });
}
