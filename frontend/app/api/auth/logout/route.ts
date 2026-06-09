import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import { REFRESH_COOKIE_NAME, clearRefreshSession } from "@/app/api/auth/_lib/session-state";
import { callAuthUpstream } from "@/app/api/auth/_lib/upstream";

async function callBackendLogout(
  refreshToken: string,
  authorization: string | null,
  sourceHeaders: Headers,
) {
  return callAuthUpstream("/api/auth/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({ refresh: refreshToken }),
  }, sourceHeaders);
}

async function refreshAccessToken(
  refreshToken: string,
  sourceHeaders: Headers,
): Promise<string | null> {
  const refreshResult = await refreshWithSingleFlight(refreshToken, sourceHeaders);
  return refreshResult.kind === "success" ? refreshResult.accessToken : null;
}

export async function POST(request: NextRequest) {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
  const sourceHeaders = request.headers;
  let authorization = request.headers.get("authorization");

  // Best-effort: always clear cookies regardless of Django response
  try {
    if (refreshToken) {
      let logoutResponse = await callBackendLogout(
        refreshToken,
        authorization,
        sourceHeaders,
      );

      if (logoutResponse.kind === "response" && logoutResponse.status === 401) {
        const refreshedAccessToken = await refreshAccessToken(
          refreshToken,
          sourceHeaders,
        );
        if (refreshedAccessToken) {
          authorization = `Bearer ${refreshedAccessToken}`;
          logoutResponse = await callBackendLogout(
            refreshToken,
            authorization,
            sourceHeaders,
          );
        }
      }

      void logoutResponse;
    }
  } catch {
    // Ignore upstream errors — cookies will be cleared anyway
  }

  clearRefreshSession(jar);

  return NextResponse.json({ detail: "Logout successful." });
}
