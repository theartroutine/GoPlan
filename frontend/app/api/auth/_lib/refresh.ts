import {
  callAuthUpstream,
  extractCode,
  extractDetail,
  getString,
} from "@/app/api/auth/_lib/upstream";

type RefreshSuccess = {
  kind: "success";
  accessToken: string;
  refreshToken: string;
};

type RefreshAuthError = {
  kind: "auth_error";
  status: 401;
  detail: string;
  code: string | null;
};

type RefreshTransientError = {
  kind: "transient_error";
  status: number;
  detail: string;
};

export type RefreshResult =
  | RefreshSuccess
  | RefreshAuthError
  | RefreshTransientError;

const inFlightRefreshByToken = new Map<string, Promise<RefreshResult>>();

async function performRefresh(refreshToken: string): Promise<RefreshResult> {
  const upstream = await callAuthUpstream("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (upstream.kind === "network_error") {
    return {
      kind: "transient_error",
      status: 503,
      detail: upstream.detail,
    };
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      return {
        kind: "auth_error",
        status: 401,
        detail: extractDetail(upstream.data, "Session expired."),
        code: extractCode(upstream.data),
      };
    }

    return {
      kind: "transient_error",
      status: upstream.status,
      detail: extractDetail(
        upstream.data,
        "Authentication service is temporarily unavailable.",
      ),
    };
  }

  const accessToken = getString(upstream.data, "access");
  if (!accessToken) {
    return {
      kind: "transient_error",
      status: 502,
      detail: "Invalid refresh payload from auth service.",
    };
  }

  const rotatedRefreshToken = getString(upstream.data, "refresh");
  const nextRefreshToken =
    typeof rotatedRefreshToken === "string" && rotatedRefreshToken.length > 0
      ? rotatedRefreshToken
      : refreshToken;

  return {
    kind: "success",
    accessToken,
    refreshToken: nextRefreshToken,
  };
}

export async function refreshWithSingleFlight(
  refreshToken: string,
): Promise<RefreshResult> {
  const existingPromise = inFlightRefreshByToken.get(refreshToken);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = performRefresh(refreshToken).finally(() => {
    inFlightRefreshByToken.delete(refreshToken);
  });

  inFlightRefreshByToken.set(refreshToken, promise);
  return promise;
}
