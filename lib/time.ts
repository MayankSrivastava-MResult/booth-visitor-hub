/* Dates and times in Asia/Kolkata (UTC+5:30, no daylight saving).
 * "Today", the podcast list and the export date filter all use IST days. */

const TZ = 'Asia/Kolkata';

/** Calendar date (YYYY-MM-DD) in IST for a moment in time. */
export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

/** The UTC instant at which an IST calendar day starts. */
export function istDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

/** [start, end) instants covering IST days from..to inclusive. Either side may be open. */
export function istRange(from?: string | null, to?: string | null): { start: Date | null; end: Date | null } {
  const start = from ? istDayStart(from) : null;
  const end = to ? new Date(istDayStart(to).getTime() + 86400000) : null;
  return { start, end };
}

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

/** e.g. "2 Nov, 14:05" (IST). */
export function formatIst(d: Date | string): string {
  return dateTimeFmt.format(typeof d === 'string' ? new Date(d) : d);
}

/** e.g. "Mon 2 Nov". */
export function formatIstDay(date: string): string {
  return dateFmt.format(istDayStart(date));
}
