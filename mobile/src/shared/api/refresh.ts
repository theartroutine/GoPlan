import { create } from 'axios';
import { getApiBaseUrl } from './base-url';
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from './token-store';

interface RefreshResponse {
  access: string;
  refresh: string;
}

// Bare instance: must NOT share apiClient's interceptors, or a failing
// refresh would recursively trigger another refresh.
export const refreshHttp = create();

let inFlight: Promise<string | null> | null = null;
let onRefreshFailed: (() => void) | null = null;

export function setOnRefreshFailed(handler: (() => void) | null): void {
  onRefreshFailed = handler;
}

export function refreshTokens(): Promise<string | null> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function doRefresh(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) {
    return null;
  }
  try {
    const { data } = await refreshHttp.post<RefreshResponse>(`${getApiBaseUrl()}/auth/refresh`, { refresh });
    setAccessToken(data.access);
    // Backend rotates refresh tokens (ROTATE_REFRESH_TOKENS): persist the new one.
    await setRefreshToken(data.refresh);
    return data.access;
  } catch {
    await clearTokens();
    onRefreshFailed?.();
    return null;
  }
}
