import { mergeHeadersWithTrustedClient } from "@/app/api/_lib/upstream-headers";
import { API_BASE_URL } from "@/shared/http/config";

const DEFAULT_UPSTREAM_ERROR_DETAIL =
  "Authentication service is temporarily unavailable.";

type JsonObject = Record<string, unknown>;

export type UpstreamCallResult =
  | {
      kind: "response";
      ok: boolean;
      status: number;
      data: unknown;
      headers?: Headers;
    }
  | {
      kind: "network_error";
      detail: string;
    };

async function parseResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { detail: DEFAULT_UPSTREAM_ERROR_DETAIL };
  }
}

export async function callAuthUpstream(
  path: string,
  init: RequestInit,
  sourceHeaders?: Headers | null,
): Promise<UpstreamCallResult> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: mergeHeadersWithTrustedClient(init.headers, sourceHeaders),
    });
    const data = await parseResponseBody(response);

    return {
      kind: "response",
      ok: response.ok,
      status: response.status,
      data,
      headers: response.headers,
    };
  } catch {
    return {
      kind: "network_error",
      detail: DEFAULT_UPSTREAM_ERROR_DETAIL,
    };
  }
}

export function asObject(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

export function getString(value: unknown, key: string): string | null {
  const objectValue = asObject(value);
  const candidate = objectValue?.[key];
  return typeof candidate === "string" ? candidate : null;
}

export function extractDetail(value: unknown, fallback: string): string {
  const objectValue = asObject(value);
  const detail = objectValue?.detail;

  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string" && first.length > 0) {
      return first;
    }
  }

  return fallback;
}

export function extractCode(value: unknown): string | null {
  return getString(value, "code");
}

export function getBoolean(value: unknown, key: string): boolean | null {
  const objectValue = asObject(value);
  const candidate = objectValue?.[key];
  return typeof candidate === "boolean" ? candidate : null;
}

export function extractUserPayload(
  user: JsonObject | null,
): Record<string, unknown> | null {
  if (!user) return null;

  const id = getString(user, "id");
  const email = getString(user, "email");
  if (!id || !email) return null;

  const isProfileCompleted = getBoolean(user, "is_profile_completed");
  const requiresProfileSetup = getBoolean(user, "requires_profile_setup");
  if (isProfileCompleted === null || requiresProfileSetup === null) return null;

  return {
    id,
    email,
    first_name: getString(user, "first_name") ?? "",
    last_name: getString(user, "last_name") ?? "",
    display_name: getString(user, "display_name") ?? "",
    identify_name: getString(user, "identify_name"),
    identify_code: getString(user, "identify_code"),
    identify_tag: getString(user, "identify_tag"),
    avatar_url: getString(user, "avatar_url"),
    email_verified: getBoolean(user, "email_verified") ?? false,
    is_profile_completed: isProfileCompleted,
    requires_profile_setup: requiresProfileSetup,
  };
}

export function normalizeErrorPayload(
  value: unknown,
  fallback: string,
): Record<string, unknown> {
  if (typeof value === "string" && value.length > 0) {
    return { detail: value };
  }

  if (Array.isArray(value)) {
    return { detail: value };
  }

  const objectValue = asObject(value);
  if (objectValue) {
    return objectValue;
  }

  return { detail: fallback };
}
