import axios from "axios";

import { tokenManager } from "@/features/auth/infrastructure/token-manager";

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

bff.interceptors.response.use(
  (response) => {
    captureAccessToken(response.headers);
    return response;
  },
  (error: unknown) => {
    if (error && typeof error === "object" && "response" in error) {
      const axiosError = error as { response?: { headers?: Record<string, unknown> } };
      if (axiosError.response?.headers) {
        captureAccessToken(axiosError.response.headers);
      }
    }
    return Promise.reject(error);
  },
);

export { bff };
