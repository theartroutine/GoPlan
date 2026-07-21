import { CURATED_TIMEZONE_OPTIONS, getTimezoneOptions, TRIP_CURRENCY_CODES } from '../options';

describe('trip options', () => {
  it('keeps the currency choices aligned with the backend contract', () => {
    expect(TRIP_CURRENCY_CODES).toEqual(['VND', 'USD', 'EUR', 'JPY', 'KRW', 'SGD', 'THB', 'AUD', 'GBP', 'CAD']);
  });

  it('uses curated timezones by default and retains an existing supported timezone outside the list', () => {
    expect(getTimezoneOptions()).toBe(CURATED_TIMEZONE_OPTIONS);
    expect(getTimezoneOptions('Pacific/Auckland')).toEqual(['Pacific/Auckland', ...CURATED_TIMEZONE_OPTIONS]);
    expect(getTimezoneOptions('Asia/Ho_Chi_Minh')).toBe(CURATED_TIMEZONE_OPTIONS);
  });
});
