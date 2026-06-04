import { headers } from "next/headers";

const LOCAL_PUBLIC_APP_BASE_URL = "http://localhost:3000";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

export async function resolvePublicAppBaseUrl(): Promise<string> {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (configuredOrigin) return normalizeOrigin(configuredOrigin);

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_PUBLIC_APP_BASE_URL;
  }

  const requestHeaders = await headers();
  const host = firstHeaderValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  if (!host) {
    throw new Error(
      "Missing NEXT_PUBLIC_APP_BASE_URL and request host for public memory share URLs.",
    );
  }

  const forwardedProto = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProto || (host.startsWith("localhost") ? "http" : "https");
  return normalizeOrigin(`${protocol}://${host}`);
}
