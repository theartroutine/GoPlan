import { create, AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from './base-url';
import { refreshTokens } from './refresh';
import { getAccessToken } from './token-store';

interface RetriableConfig extends InternalAxiosRequestConfig {
  retriedAfterRefresh?: boolean;
}

export const apiClient = create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const headers = new AxiosHeaders(config.headers);
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const hadAuthHeader = Boolean(config && new AxiosHeaders(config.headers).has('Authorization'));

  if (error.response?.status !== 401 || !config || config.retriedAfterRefresh || !hadAuthHeader) {
    throw error;
  }

  const newAccess = await refreshTokens();
  if (!newAccess) {
    throw error;
  }

  config.retriedAfterRefresh = true;
  config.headers.set('Authorization', `Bearer ${newAccess}`);
  return apiClient.request(config);
});
