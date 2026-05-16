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

export { nextMonth, prevMonth };
