import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { refreshWithSingleFlight } from "@/app/api/auth/_lib/refresh";
import {
  REFRESH_COOKIE_NAME,
  handleRefreshFailure,
  setNoStoreHeaders,
  setRefreshToken,
} from "@/app/api/auth/_lib/session-state";
import { API_BASE_URL } from "@/shared/http/config";

async function resolveBearer(
  jar: Awaited<ReturnType<typeof cookies>>,
  incomingAuth: string | null,
): Promise<
  | { ok: true; bearer: string; refreshedAccessToken: string | null }
  | { ok: false; response: NextResponse }
> {
  if (incomingAuth) {
    return { ok: true, bearer: incomingAuth, refreshedAccessToken: null };
  }

  const refreshToken = jar.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return {
      ok: false,
      response: NextResponse.json({ detail: "Not authenticated." }, { status: 401 }),
    };
  }

  const refreshResult = await refreshWithSingleFlight(refreshToken);
  const failureResponse = handleRefreshFailure(jar, refreshResult);
  if (failureResponse) return { ok: false, response: failureResponse };
  if (refreshResult.kind !== "success") {
    return {
      ok: false,
      response: NextResponse.json({ detail: "Auth failed." }, { status: 401 }),
    };
  }
  setRefreshToken(jar, refreshResult.refreshToken);
  return {
    ok: true,
    bearer: `Bearer ${refreshResult.accessToken}`,
    refreshedAccessToken: refreshResult.accessToken,
  };
}

async function callAvatarUpstream(
  method: "PATCH" | "DELETE",
  bearer: string,
  body?: BodyInit,
): Promise<{ data: unknown; status: number; headers?: Headers }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/avatar`, {
      method,
      headers: { Authorization: bearer },
      body,
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: "Avatar request failed." };
    }
    return { data, status: res.status, headers: res.headers };
  } catch {
    return {
      data: { detail: "Avatar service unavailable." },
      status: 503,
    };
  }
}

function finalize(
  result: { data: unknown; status: number; headers?: Headers },
  refreshedAccessToken: string | null,
): NextResponse {
  const response = NextResponse.json(result.data, { status: result.status });
  const retryAfter = result.headers?.get("Retry-After");
  if (retryAfter) {
    response.headers.set("Retry-After", retryAfter);
  }
  if (refreshedAccessToken) {
    response.headers.set("X-Access-Token", refreshedAccessToken);
    setNoStoreHeaders(response);
  }
  return response;
}

export async function PATCH(request: NextRequest) {
  const jar = await cookies();
  const auth = await resolveBearer(jar, request.headers.get("Authorization"));
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }
  const file = formData.get("avatar");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ detail: "No avatar file provided." }, { status: 400 });
  }

  const djangoForm = new FormData();
  djangoForm.append("avatar", file);

  let result = await callAvatarUpstream("PATCH", auth.bearer, djangoForm);
  let refreshedAccessToken = auth.refreshedAccessToken;

  if (result.status === 401) {
    const retry = await resolveBearer(jar, null);
    if (!retry.ok) return retry.response;
    refreshedAccessToken = retry.refreshedAccessToken ?? refreshedAccessToken;
    const retryForm = new FormData();
    retryForm.append("avatar", file);
    result = await callAvatarUpstream("PATCH", retry.bearer, retryForm);
  }

  return finalize(result, refreshedAccessToken);
}

export async function DELETE(request: NextRequest) {
  const jar = await cookies();
  const auth = await resolveBearer(jar, request.headers.get("Authorization"));
  if (!auth.ok) return auth.response;

  let result = await callAvatarUpstream("DELETE", auth.bearer);
  let refreshedAccessToken = auth.refreshedAccessToken;

  if (result.status === 401) {
    const retry = await resolveBearer(jar, null);
    if (!retry.ok) return retry.response;
    refreshedAccessToken = retry.refreshedAccessToken ?? refreshedAccessToken;
    result = await callAvatarUpstream("DELETE", retry.bearer);
  }

  return finalize(result, refreshedAccessToken);
}
