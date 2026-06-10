import axios from "axios";
import { toast } from "sonner";

import { tokenManager } from "@/features/auth/infrastructure/token-manager";

declare module "axios" {
  export interface AxiosRequestConfig {
    /**
     * Skip the global "Too many requests" toast for this request. Use for
     * background calls (e.g. WebSocket ticket fetches) whose failure is
     * already surfaced elsewhere (connection banner).
     */
    suppressThrottleToast?: boolean;
  }
}

const bff = axios.create({
  baseURL: "",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

bff.interceptors.request.use((config) => {
  const token = tokenManager.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function captureAccessToken(headers: Record<string, unknown>) {
  const newToken = headers["x-access-token"];
  if (typeof newToken === "string" && newToken.length > 0) {
    tokenManager.set(newToken);
  }
}

function getHeaderValue(headers: Record<string, unknown>, key: string): string | null {
  const value = headers[key];
  if (typeof value === "string" && value.length > 0) return value;

  const getter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof getter !== "function") return null;

  const getterValue = getter.call(headers, key);
  return typeof getterValue === "string" && getterValue.length > 0
    ? getterValue
    : null;
}

function getRetryAfterMessage(headers: Record<string, unknown>): string {
  const retryAfter = getHeaderValue(headers, "retry-after");
  if (!retryAfter) return "Too many requests. Please try again later.";

  const retryAfterSeconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(retryAfterSeconds)) {
    return `Too many requests. Please try again in ${retryAfterSeconds}s.`;
  }

  return `Too many requests. Please try again after ${retryAfter}.`;
}

bff.interceptors.response.use(
  (response) => {
    captureAccessToken(response.headers);
    return response;
  },
  (error: unknown) => {
    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as {
        config?: { suppressThrottleToast?: boolean };
        response?: {
          headers?: Record<string, unknown>;
          status?: number;
        };
      };
      if (axiosError.response?.headers) {
        captureAccessToken(axiosError.response.headers);
      }
      if (
        axiosError.response?.status === 429 &&
        axiosError.response.headers &&
        !axiosError.config?.suppressThrottleToast
      ) {
        toast.error(getRetryAfterMessage(axiosError.response.headers));
      }
    }
    return Promise.reject(error);
  },
);

export { bff };
