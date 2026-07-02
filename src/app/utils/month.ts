import { nextMonth, prevMonth } from "../../engine.js";
import type { Month } from "../../types.js";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(month: Month): string {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return month;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function shortMonthLabel(month: Month): string {
  return monthLabel(month).slice(0, 3) + " " + month.slice(0, 4);
}

export function monthsBetween(from: Month, to: Month): Month[] {
  if (from > to) return [];
  const out: Month[] = [];
  let m = from;
  while (m <= to) {
    out.push(m);
    if (m === to) break;
    m = nextMonth(m);
  }
  return out;
}

export function addMonths(month: Month, delta: number): Month {
  let m = month;
  const step = delta > 0 ? nextMonth : prevMonth;
  for (let i = 0; i < Math.abs(delta); i++) m = step(m);
  return m;
}

/**
 * Parse "YYYY-MM-DD" as a LOCAL date. `new Date("YYYY-MM-DD")` treats the
 * string as UTC midnight, which makes "today" read as "yesterday" for anyone
 * west of Greenwich — a classic off-by-a-day bug.
 */
export function parseIsoDateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** "Today" / "Yesterday" / weekday / full date — always in local time. */
export function friendlyDayLabel(iso: string, now: Date = new Date()): string {
  const d = parseIsoDateLocal(iso);
  if (!d) return iso;
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((todayMid - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("en-GB", { weekday: "long" });
  }
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
}

/** True when `iso` is a real calendar date in YYYY-MM-DD form. */
export function isValidIsoDate(iso: string): boolean {
  const d = parseIsoDateLocal(iso);
  if (!d) return false;
  // Reject rollovers like 2026-02-31 → Mar 3.
  return iso === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export { nextMonth, prevMonth };
