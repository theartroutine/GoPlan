export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error('EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to mobile/.env.');
  }
  return `${url.replace(/\/+$/, '')}/api`;
}
