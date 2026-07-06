 
import { apiClient } from '@/shared/api/client';
import { fetchMe, loginRequest, profileSetupRequest } from '../api';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('auth api', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loginRequest posts credentials and returns the auth payload', async () => {
    const payload = { user: { id: 'u1' }, tokens: { access: 'a', refresh: 'r', token_type: 'Bearer' } };
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: payload });
    await expect(loginRequest('a@b.com', 'secret')).resolves.toEqual(payload);
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'secret' });
  });

  it('fetchMe unwraps the user envelope', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({ data: { user: { id: 'u1' } } });
    await expect(fetchMe()).resolves.toEqual({ id: 'u1' });
  });

  it('profileSetupRequest unwraps the user envelope', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: { user: { id: 'u1' } } });
    await expect(
      profileSetupRequest({ first_name: 'Quang', last_name: 'Minh', identify_name: 'quangminh' }),
    ).resolves.toEqual({ id: 'u1' });
    expect(post).toHaveBeenCalledWith('/auth/profile/setup', {
      first_name: 'Quang',
      last_name: 'Minh',
      identify_name: 'quangminh',
    });
  });
});
