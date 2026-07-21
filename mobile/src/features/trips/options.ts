export const TRIP_CURRENCY_CODES = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'THB', 'AUD', 'GBP', 'CAD'] as const;

export const CURATED_TIMEZONE_OPTIONS = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

export function getTimezoneOptions(currentTimezone?: string): readonly string[] {
  if (!currentTimezone || CURATED_TIMEZONE_OPTIONS.some((timezone) => timezone === currentTimezone)) {
    return CURATED_TIMEZONE_OPTIONS;
  }
  return [currentTimezone, ...CURATED_TIMEZONE_OPTIONS];
}
