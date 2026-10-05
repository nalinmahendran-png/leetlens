/**
 * Calendar days in a fixed timezone, for the daily set that resets at midnight.
 * DAILY_TIMEZONE is an IANA name like "Asia/Kolkata"; without it, the server's own timezone is used.
 */
export function dailyTimeZone(): string {
  return process.env.DAILY_TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** How far `timeZone`'s wall clock is ahead of UTC at this instant, in ms (e.g. +5:30 for India). */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight that started the current day in `timeZone`. */
export function startOfDay(now: Date, timeZone: string): Date {
  const offset = offsetMs(now, timeZone);
  const wall = new Date(now.getTime() + offset);
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  // the offset at midnight can differ from now's on a daylight-saving day
  return new Date(midnightWall - offsetMs(new Date(midnightWall - offset), timeZone));
}

/** The coming midnight in `timeZone`. */
export function startOfNextDay(now: Date, timeZone: string): Date {
  // 36 hours after this midnight is always inside the next day, even across a DST change
  return startOfDay(new Date(startOfDay(now, timeZone).getTime() + 36 * 60 * 60 * 1000), timeZone);
}
