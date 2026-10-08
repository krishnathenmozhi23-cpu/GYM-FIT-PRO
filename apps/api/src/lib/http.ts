import type { Request } from "express";
import { addDays, daysBetween, toIsoDate } from "./dates.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The user's local calendar date. Clients send `X-Client-Date` so that
 * "today" matches the user's timezone; we only accept values within ±1 day
 * of the server's UTC date and otherwise fall back to UTC.
 */
export function clientToday(req: Request): string {
  const utc = toIsoDate(new Date());
  const header = req.header("x-client-date");
  if (header && ISO_DATE.test(header) && Math.abs(daysBetween(utc, header)) <= 1) return header;
  return utc;
}

export { addDays };

import { z } from "zod";
import { notFound } from "./errors.js";

const uuid = z.uuid();
/** Route params that must be UUIDs; anything else is simply "not found". */
export function uuidParam(req: Request, name: string, what = "Resource"): string {
  const value = req.params[name];
  if (!uuid.safeParse(value).success) throw notFound(what);
  return value as string;
}
