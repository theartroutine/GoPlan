// Trip dates are date-only strings (YYYY-MM-DD) in the trip's own timezone;
// parse/format in local calendar terms and never round-trip through UTC.

const displayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function formatDisplayDate(value: string): string {
  return displayFormatter.format(parseDateOnly(value));
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return formatDisplayDate(start);
  }
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}
