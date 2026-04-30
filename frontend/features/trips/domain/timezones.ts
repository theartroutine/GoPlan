const FALLBACK_TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Shanghai",
  "Asia/Dubai",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (input: "timeZone") => string[];
};

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}

export function getSupportedTimezones(currentTimezone?: string): string[] {
  let runtimeTimezones: string[] = [];

  try {
    runtimeTimezones = (Intl as IntlWithSupportedValues).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    runtimeTimezones = [];
  }

  return Array.from(
    new Set([
      ...FALLBACK_TIMEZONES,
      ...runtimeTimezones,
      ...(currentTimezone ? [currentTimezone] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b));
}
