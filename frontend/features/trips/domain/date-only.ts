const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

function parseDateOnlyParts(value: string): DateOnlyParts {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatDateOnly(
  value: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-US",
): string {
  const { year, month, day } = parseDateOnlyParts(value);

  return new Intl.DateTimeFormat(locale, options).format(new Date(year, month - 1, day));
}

export function getInclusiveDateOnlySpan(start: string, end: string): number {
  const startParts = parseDateOnlyParts(start);
  const endParts = parseDateOnlyParts(end);

  const startUtcTime = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endUtcTime = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

  return Math.floor((endUtcTime - startUtcTime) / MILLISECONDS_PER_DAY) + 1;
}
