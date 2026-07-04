import * as SecureStore from 'expo-secure-store';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../token-store';

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

describe('token store', () => {
  beforeEach(async () => {
    await clearTokens();
    jest.clearAllMocks();
  });

  it('keeps the access token in memory only', () => {
    setAccessToken('access-1');
    expect(getAccessToken()).toBe('access-1');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('persists the refresh token via SecureStore under the goplan key', async () => {
    await setRefreshToken('refresh-1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('goplan.refresh_token', 'refresh-1');
    await expect(getRefreshToken()).resolves.toBe('refresh-1');
  });

  it('deletes the stored token when set to null', async () => {
    await setRefreshToken('refresh-1');
    await setRefreshToken(null);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('goplan.refresh_token');
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  it('clearTokens wipes both tokens', async () => {
    setAccessToken('access-1');
    await setRefreshToken('refresh-1');
    await clearTokens();
    expect(getAccessToken()).toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });
});
