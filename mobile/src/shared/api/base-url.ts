export function getApiBaseUrl(): string {
  return `${getServerRootUrl()}/api`;
}

export function getServerRootUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error('EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to mobile/.env.');
  }
  return url.replace(/\/+$/, '');
}

// Backend media fields (cover_image_url, avatar_url) are public paths like /media/...
// In production Django serves them through the API media endpoint, not MEDIA_URL directly.
export function resolveMediaUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const mediaPrefix = path.startsWith('/media/') ? '/media/' : path.startsWith('media/') ? 'media/' : null;
  if (mediaPrefix) {
    return `${getApiBaseUrl()}/media/files/${path.slice(mediaPrefix.length)}`;
  }
  return `${getServerRootUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
}
