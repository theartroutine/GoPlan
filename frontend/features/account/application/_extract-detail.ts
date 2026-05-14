import axios from "axios";

export function extractDetail(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return fallback;
}
