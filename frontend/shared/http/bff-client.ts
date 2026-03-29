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

bff.interceptors.response.use((response) => {
  const newToken = response.headers["x-access-token"];
  if (typeof newToken === "string" && newToken.length > 0) {
    tokenManager.set(newToken);
  }
  return response;
});

export { bff };
