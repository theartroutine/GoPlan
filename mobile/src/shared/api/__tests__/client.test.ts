jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});
jest.mock('../refresh', () => ({
  refreshTokens: jest.fn(),
}));

// eslint-disable-next-line import/first
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
// eslint-disable-next-line import/first
import { apiClient } from '../client';
// eslint-disable-next-line import/first
import { refreshTokens } from '../refresh';
// eslint-disable-next-line import/first
import { clearTokens, setAccessToken } from '../token-store';

const mockRefreshTokens = refreshTokens as jest.MockedFunction<typeof refreshTokens>;

function installAdapter(handler: (config: InternalAxiosRequestConfig, attempt: number) => { status: number; data: unknown }) {
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    const { status, data } = handler(config, attempts);
    if (status >= 400) {
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
        status,
        statusText: '',
        headers: {},
        config,
        data,
      });
    }
    return { status, statusText: 'OK', headers: {}, config, data };
  };
  return () => attempts;
}

describe('apiClient', () => {
  beforeEach(async () => {
    await clearTokens();
    mockRefreshTokens.mockReset();
  });

  it('attaches the bearer token when an access token exists', async () => {
    setAccessToken('access-1');
    let seenAuth: string | undefined;
    installAdapter((config) => {
      seenAuth = new AxiosHeaders(config.headers).get('Authorization') as string | undefined;
      return { status: 200, data: {} };
    });
    await apiClient.get('/auth/me');
    expect(seenAuth).toBe('Bearer access-1');
  });

  it('refreshes once and replays a 401ed authenticated request', async () => {
    setAccessToken('stale');
    mockRefreshTokens.mockResolvedValue('fresh');
    const getAttempts = installAdapter((config, attempt) => {
      const auth = new AxiosHeaders(config.headers).get('Authorization');
      if (attempt === 1) return { status: 401, data: { detail: 'expired' } };
      expect(auth).toBe('Bearer fresh');
      return { status: 200, data: { ok: true } };
    });

    const response = await apiClient.get('/auth/me');
    expect(response.data).toEqual({ ok: true });
    expect(getAttempts()).toBe(2);
    expect(mockRefreshTokens).toHaveBeenCalledTimes(1);
  });

  it('does not attempt refresh for anonymous 401s (bad login credentials)', async () => {
    installAdapter(() => ({ status: 401, data: { detail: 'Invalid email or password.' } }));
    await expect(apiClient.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError);
    expect(mockRefreshTokens).not.toHaveBeenCalled();
  });

  it('propagates the original error when refresh fails', async () => {
    setAccessToken('stale');
    mockRefreshTokens.mockResolvedValue(null);
    const getAttempts = installAdapter(() => ({ status: 401, data: { detail: 'expired' } }));
    await expect(apiClient.get('/auth/me')).rejects.toBeInstanceOf(AxiosError);
    expect(getAttempts()).toBe(1);
  });
});
