const RAW_PUBLIC_APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";

export const PUBLIC_APP_BASE_URL = RAW_PUBLIC_APP_BASE_URL.replace(/\/+$/, "");
