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

// eslint-disable-next-line import/first
import { refreshHttp, refreshTokens, setOnRefreshFailed } from '../refresh';
// eslint-disable-next-line import/first
import { clearTokens, getAccessToken, getRefreshToken, setRefreshToken } from '../token-store';

describe('refreshTokens', () => {
  beforeEach(async () => {
    await clearTokens();
    setOnRefreshFailed(null);
    jest.restoreAllMocks();
  });

  it('returns null without calling the API when no refresh token is stored', async () => {
    const post = jest.spyOn(refreshHttp, 'post');
    await expect(refreshTokens()).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('stores the new access and rotated refresh token on success', async () => {
    await setRefreshToken('old-refresh');
    jest.spyOn(refreshHttp, 'post').mockResolvedValue({ data: { access: 'new-access', refresh: 'new-refresh' } });

    await expect(refreshTokens()).resolves.toBe('new-access');
    expect(refreshHttp.post).toHaveBeenCalledWith('http://testserver:8000/api/auth/refresh', { refresh: 'old-refresh' });
    expect(getAccessToken()).toBe('new-access');
    await expect(getRefreshToken()).resolves.toBe('new-refresh');
  });

  it('coalesces concurrent calls into one request', async () => {
    await setRefreshToken('old-refresh');
    const post = jest
      .spyOn(refreshHttp, 'post')
      .mockResolvedValue({ data: { access: 'new-access', refresh: 'new-refresh' } });

    const [a, b] = await Promise.all([refreshTokens(), refreshTokens()]);
    expect(a).toBe('new-access');
    expect(b).toBe('new-access');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('clears tokens and notifies on failure', async () => {
    await setRefreshToken('revoked');
    jest.spyOn(refreshHttp, 'post').mockRejectedValue(new Error('401'));
    const onFailed = jest.fn();
    setOnRefreshFailed(onFailed);

    await expect(refreshTokens()).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });
});
