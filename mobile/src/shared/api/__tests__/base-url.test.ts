import { getApiBaseUrl, getServerRootUrl, resolveMediaUrl } from '../base-url';

describe('API and media URLs', () => {
  it('builds the API URL from the configured server root', () => {
    expect(getServerRootUrl()).toBe('http://testserver:8000');
    expect(getApiBaseUrl()).toBe('http://testserver:8000/api');
  });

  it('maps backend media paths to the public API media endpoint', () => {
    expect(resolveMediaUrl('/media/trip-covers/cover.webp')).toBe(
      'http://testserver:8000/api/media/files/trip-covers/cover.webp',
    );
    expect(resolveMediaUrl('media/avatars/avatar.webp')).toBe(
      'http://testserver:8000/api/media/files/avatars/avatar.webp',
    );
  });

  it('keeps absolute URLs and resolves other server-relative paths', () => {
    expect(resolveMediaUrl('https://cdn.example.com/cover.webp')).toBe('https://cdn.example.com/cover.webp');
    expect(resolveMediaUrl('/health')).toBe('http://testserver:8000/health');
    expect(resolveMediaUrl(null)).toBeNull();
  });
});
