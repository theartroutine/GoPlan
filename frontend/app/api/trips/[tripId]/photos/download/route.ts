import type { NextRequest } from "next/server";

import { proxyTripPhotosBulkDownload } from "@/app/api/trips/[tripId]/photos/_lib/photo-asset-proxy";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { tripId } = await context.params;
  const body = await request.text();
  return proxyTripPhotosBulkDownload({ request, tripId, body });
}
