import type { IsoDate, Month, Transaction } from "../types.js";
import type { Movement, RecurringRule, RecurringTemplate, WealthState } from "./state.js";
import type { MovementInput } from "./store.js";
import { balanceOn, buildLedger } from "./wealth.js";
import { roundMoney } from "./utils/money.js";
import { addMonths } from "./utils/month.js";

/** The rule's date in `month`, clamped to the month's length (31st → 30 Apr, 28/29 Feb). */
export function occurrenceDate(month: Month, day: number): IsoDate {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

export interface Occurrence {
  rule: RecurringRule;
  month: Month;
  date: IsoDate;
  /** Due = on or before today; upcoming = later this month. */
  status: "due" | "upcoming";
  /**
   * Amount to log. For "pay full balance" rules it's what the card owes on
   * the occurrence date (or today, if that's earlier); null when nothing is owed.
   */
  amount: number | null;
  /** An entry of the same shape was logged this month without using the reminder. */
  similarDate: IsoDate | null;
}

type Entry = { kind: "spend"; t: Transaction } | { kind: "movement"; m: Movement };

function sameShape(t: RecurringTemplate, e: Entry): boolean {
  if (e.kind === "spend") return t.kind === "spend" && e.t.categoryId === t.categoryId;
  const m = e.m;
  if (t.kind === "income") return m.type === "income" && m.accountId === t.accountId && m.source === t.source;
  if (t.kind === "expense") return m.type === "expense" && m.accountId === t.accountId;
  if (t.kind === "transfer")
    return m.type === "transfer" && m.fromAccountId === t.fromAccountId && m.toAccountId === t.toAccountId;
  return false;
}

/**
 * Reminders for `month`. An occurrence disappears once an entry logged from
 * the rule exists in that month, or the month is skipped. Nothing is ever
 * logged automatically — a wrong guess in a financial record is worse than
 * a reminder.
 */
export function occurrencesFor(
  wealth: WealthState,
  transactions: Transaction[],
  month: Month,
  today: IsoDate,
): Occurrence[] {
  const entries: Entry[] = [
    ...transactions.filter((t) => t.date.startsWith(month)).map((t) => ({ kind: "spend" as const, t })),
    ...wealth.movements.filter((m) => m.date.startsWith(month)).map((m) => ({ kind: "movement" as const, m })),
  ];
  const done = new Set<string>();
  for (const e of entries) {
    const id = e.kind === "spend" ? e.t.recurringId : e.m.recurringId;
    if (id) done.add(id);
  }
  let ledger: ReturnType<typeof buildLedger> | null = null;

  const out: Occurrence[] = [];
  for (const rule of wealth.recurring) {
    if (rule.paused || month < rule.startMonth || rule.skipped.includes(month) || done.has(rule.id)) continue;
    const date = occurrenceDate(month, rule.day);
    const t = rule.template;
    let amount: number | null = t.amount;
    if (t.kind === "transfer" && t.payFullBalance) {
      ledger ??= buildLedger(wealth, transactions);
      const owed = balanceOn(ledger, t.toAccountId, date < today ? date : today)?.balance ?? 0;
      amount = owed > 0 ? roundMoney(owed) : null;
    }
    const similar = entries.find((e) => !(e.kind === "spend" ? e.t.recurringId : e.m.recurringId) && sameShape(t, e));
    out.push({
      rule,
      month,
      date,
      status: date <= today ? "due" : "upcoming",
      amount,
      similarDate: similar ? (similar.kind === "spend" ? similar.t.date : similar.m.date) : null,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type LoggableEntry =
  | {
      kind: "spend";
      input: { categoryId: string; date: IsoDate; amount: number; note?: string; accountId?: string; recurringId: string };
    }
  | { kind: "movement"; input: MovementInput };

/** Turns a rule's template into the exact entry to log for one occurrence. */
export function entryFor(rule: RecurringRule, date: IsoDate, amount: number): LoggableEntry {
  const t = rule.template;
  const base = { date, amount: roundMoney(amount), recurringId: rule.id, ...(t.note ? { note: t.note } : {}) };
  switch (t.kind) {
    case "spend":
      return { kind: "spend", input: { ...base, categoryId: t.categoryId, ...(t.accountId ? { accountId: t.accountId } : {}) } };
    case "income":
      return {
        kind: "movement",
        input: {
          ...base,
          type: "income",
          accountId: t.accountId,
          source: t.source,
          ...(t.budgetOffset === null ? {} : { budgetMonth: addMonths(date.slice(0, 7), t.budgetOffset) }),
        },
      };
    case "transfer":
      return { kind: "movement", input: { ...base, type: "transfer", fromAccountId: t.fromAccountId, toAccountId: t.toAccountId } };
    case "expense":
      return { kind: "movement", input: { ...base, type: "expense", accountId: t.accountId } };
  }
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
