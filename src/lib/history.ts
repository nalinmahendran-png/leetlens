/**
 * Builds the progress series for the trajectory chart.
 * Real data = daily snapshots we stored. Before we started tracking someone, we ESTIMATE
 * earlier weeks from LeetCode's yearly submission calendar (shape only, scaled to the
 * earliest real total), and mark those points `estimated` so the UI can say so.
 */
export interface SnapshotLike {
  takenAt: Date;
  totalSolved: number;
}

export interface SeriesPoint {
  date: Date;
  total: number;
  estimated: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** cumulative submissions with day <= t, from the calendar (keys are unix seconds) */
function makeCumulative(calendar: Record<string, number>) {
  const days = Object.entries(calendar)
    .map(([k, v]) => [Number(k) * 1000, Number(v)] as const)
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
  const totalAll = days.reduce((s, [, v]) => s + v, 0);
  return {
    totalAll,
    upTo(t: number) {
      let sum = 0;
      for (const [d, v] of days) {
        if (d <= t) sum += v;
        else break;
      }
      return sum;
    },
  };
}

export function buildSeries(opts: {
  snapshots: SnapshotLike[];
  calendar: Record<string, number>;
  now: Date;
  weeks?: number;
}): SeriesPoint[] {
  const weeks = opts.weeks ?? 12;
  const snaps = [...opts.snapshots].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  if (snaps.length === 0) return [];

  const earliest = snaps[0];
  const cum = makeCumulative(opts.calendar);
  const cumAtEarliest = cum.upTo(earliest.takenAt.getTime());

  const points: SeriesPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const date = new Date(opts.now.getTime() - (weeks - 1 - i) * WEEK_MS);
    const t = date.getTime();

    // latest real snapshot at or before this date
    let real: SnapshotLike | undefined;
    for (const s of snaps) {
      if (s.takenAt.getTime() <= t) real = s;
      else break;
    }
    if (real) {
      points.push({ date, total: real.totalSolved, estimated: false });
    } else if (cum.totalAll > 0 && cumAtEarliest > 0) {
      const est = Math.round(earliest.totalSolved * (cum.upTo(t) / cumAtEarliest));
      points.push({ date, total: Math.min(est, earliest.totalSolved), estimated: true });
    }
    // else: nothing to say about this week, skip it
  }

  // totals never go down
  for (let i = 1; i < points.length; i++) {
    if (points[i].total < points[i - 1].total) points[i].total = points[i - 1].total;
  }
  // the last point is "now": always use the freshest snapshot
  if (points.length > 0) {
    const last = snaps[snaps.length - 1];
    points[points.length - 1] = { date: opts.now, total: last.totalSolved, estimated: false };
  }
  return points;
}

/** solves gained each week (length = points - 1) */
export function weeklyGains(series: SeriesPoint[]): number[] {
  const gains: number[] = [];
  for (let i = 1; i < series.length; i++) gains.push(series[i].total - series[i - 1].total);
  return gains;
}

/** average of the last few weeks, carried forward */
export function project(series: SeriesPoint[], weeksAhead = 3, window = 4) {
  const gains = weeklyGains(series);
  const recent = gains.slice(-window);
  const pace = recent.length ? Math.round(recent.reduce((s, g) => s + g, 0) / recent.length) : 0;
  const last = series.length ? series[series.length - 1].total : 0;
  const values = Array.from({ length: weeksAhead }, (_, i) => last + pace * (i + 1));
  return { pace, values };
}
