const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dtf = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return rtf.format(-Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return rtf.format(-Math.floor(diff / HOUR), "hour");
  if (diff < WEEK) return rtf.format(-Math.floor(diff / DAY), "day");

  return dtf.format(date);
}
