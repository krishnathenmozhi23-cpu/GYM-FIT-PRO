/** Date helpers operating on calendar dates (YYYY-MM-DD) in UTC. */

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDays(isoDate: string, days: number): string {
  const d = parseIsoDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** 0 = Monday ... 6 = Sunday */
export function dayOfWeek(isoDate: string): number {
  return (parseIsoDate(isoDate).getUTCDay() + 6) % 7;
}

export function startOfWeek(isoDate: string): string {
  return addDays(isoDate, -dayOfWeek(isoDate));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / 86_400_000);
}
