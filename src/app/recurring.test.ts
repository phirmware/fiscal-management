import { beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "../types.js";
import { computeMonth } from "../engine.js";
import type { Movement, RecurringRule, WealthAccount, WealthState } from "./state.js";
import { makeEffectiveBudget } from "./effectiveBudget.js";
import { entryFor, occurrenceDate, occurrencesFor, ordinal } from "./recurring.js";
import { useAppStore, validTemplate } from "./store.js";
import { balanceOn, buildLedger, cashFlowSeries, healthReport, netWorthAt } from "./wealth.js";

const acc = (id: string, kind: WealthAccount["kind"]): WealthAccount => ({
  id,
  name: id,
  kind,
  archived: false,
  createdAt: "2026-01-01",
});
const accounts = [acc("monzo", "current"), acc("amex", "creditCard"), acc("saver", "savings")];
const rule = (id: string, template: RecurringRule["template"], day: number, extra: Partial<RecurringRule> = {}): RecurringRule => ({
  id,
  template,
  day,
  startMonth: "2026-09",
  skipped: [],
  ...extra,
});
const state = (recurring: RecurringRule[], movements: Movement[] = []): WealthState => ({
  accounts,
  snapshots: [
    { id: "a", accountId: "monzo", date: "2026-10-01", balance: 2000 },
    { id: "b", accountId: "amex", date: "2026-10-01", balance: 0 },
    { id: "c", accountId: "saver", date: "2026-10-01", balance: 8000 },
  ],
  movements,
  recurring,
  profile: { emergencyMonthsTarget: 6 },
});

describe("occurrenceDate", () => {
  it("clamps to the month's length", () => {
    expect(occurrenceDate("2026-04", 31)).toBe("2026-04-30");
    expect(occurrenceDate("2026-02", 30)).toBe("2026-02-28");
    expect(occurrenceDate("2028-02", 30)).toBe("2028-02-29");
    expect(occurrenceDate("2026-10", 1)).toBe("2026-10-01");
  });
  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28, 31].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "28th", "31st",
    ]);
  });
});

describe("occurrencesFor", () => {
  const salary = rule("sal", { kind: "income", amount: 3200, accountId: "monzo", source: "salary", budgetOffset: 1 }, 28);
  const rent = rule("rent", { kind: "spend", amount: 1100, categoryId: "rentCat", accountId: "monzo" }, 1);

  it("lists due and upcoming occurrences in date order", () => {
    const occ = occurrencesFor(state([salary, rent]), [], "2026-10", "2026-10-15");
    expect(occ.map((o) => [o.rule.id, o.status, o.date])).toEqual([
      ["rent", "due", "2026-10-01"],
      ["sal", "upcoming", "2026-10-28"],
    ]);
  });

  it("hides an occurrence once logged from the rule, skipped, paused, or before start", () => {
    const logged: Transaction = { id: "t", categoryId: "rentCat", date: "2026-10-01", amount: 1100, recurringId: "rent" };
    expect(occurrencesFor(state([rent]), [logged], "2026-10", "2026-10-15")).toEqual([]);
    // Logged in a different month doesn't count for this one.
    expect(occurrencesFor(state([rent]), [{ ...logged, date: "2026-09-01" }], "2026-10", "2026-10-15")).toHaveLength(1);
    expect(occurrencesFor(state([{ ...rent, skipped: ["2026-10"] }]), [], "2026-10", "2026-10-15")).toEqual([]);
    expect(occurrencesFor(state([{ ...rent, paused: true }]), [], "2026-10", "2026-10-15")).toEqual([]);
    expect(occurrencesFor(state([rent]), [], "2026-08", "2026-10-15")).toEqual([]);
  });

  it("points out a similar entry logged by hand", () => {
    const manual: Transaction = { id: "t", categoryId: "rentCat", date: "2026-10-02", amount: 1100 };
    const [o] = occurrencesFor(state([rent]), [manual], "2026-10", "2026-10-15");
    expect(o!.similarDate).toBe("2026-10-02");
  });

  it("pay-full-balance uses what the card owes on the due date", () => {
    const repay = rule("rep", { kind: "transfer", amount: 0, fromAccountId: "monzo", toAccountId: "amex", payFullBalance: true }, 25);
    const txns: Transaction[] = [
      { id: "1", categoryId: "g", date: "2026-10-05", amount: 120.4, accountId: "amex" },
      { id: "2", categoryId: "g", date: "2026-10-20", amount: 80, accountId: "amex" },
      // After the due date — not part of this statement.
      { id: "3", categoryId: "g", date: "2026-10-27", amount: 999, accountId: "amex" },
    ];
    const [o] = occurrencesFor(state([repay]), txns, "2026-10", "2026-10-30");
    expect(o!.amount).toBe(200.4);
    // Before the due date, it's what's owed so far.
    const [early] = occurrencesFor(state([repay]), txns, "2026-10", "2026-10-10");
    expect(early!.amount).toBe(120.4);
    // Nothing owed → nothing to log.
    const [none] = occurrencesFor(state([repay]), [], "2026-10", "2026-10-30");
    expect(none!.amount).toBeNull();
  });
});

describe("entryFor", () => {
  it("builds income with the budget month offset from the occurrence date", () => {
    const r = rule("sal", { kind: "income", amount: 3200, accountId: "monzo", source: "salary", budgetOffset: 1, note: "Pay" }, 28);
    const e = entryFor(r, "2026-12-28", 3200);
    expect(e).toEqual({
      kind: "movement",
      input: { type: "income", date: "2026-12-28", amount: 3200, recurringId: "sal", note: "Pay", accountId: "monzo", source: "salary", budgetMonth: "2027-01" },
    });
    const none = entryFor({ ...r, template: { ...r.template, budgetOffset: null } as RecurringRule["template"] }, "2026-12-28", 50);
    expect(none.kind === "movement" && "budgetMonth" in none.input).toBe(false);
  });

  it("builds spend, transfer and expense entries tagged with the rule", () => {
    expect(entryFor(rule("r", { kind: "spend", amount: 9.99, categoryId: "subs" }, 3), "2026-10-03", 9.99)).toEqual({
      kind: "spend",
      input: { date: "2026-10-03", amount: 9.99, recurringId: "r", categoryId: "subs" },
    });
    const tr = entryFor(rule("t", { kind: "transfer", amount: 500, fromAccountId: "monzo", toAccountId: "saver" }, 1), "2026-10-01", 500);
    expect(tr.kind === "movement" && tr.input.type).toBe("transfer");
    const ex = entryFor(rule("x", { kind: "expense", amount: 40, accountId: "saver" }, 1), "2026-10-01", 40);
    expect(ex.kind === "movement" && ex.input.type).toBe("expense");
  });
});

describe("off-budget spending", () => {
  const holiday: Movement = { id: "h", type: "expense", date: "2026-10-10", amount: 1200, accountId: "saver", loggedAt: 1 };

  it("lowers the account and net worth but never the budget", () => {
    const w = state([], [holiday]);
    expect(balanceOn(buildLedger(w), "saver", "2026-10-31")!.balance).toBe(6800);
    expect(netWorthAt(w, "2026-10-31").netWorth).toBe(10000 - 1200);
    const budget = makeEffectiveBudget(
      { categories: [], budgets: [], transactions: [], savingsAccounts: [], savingsEntries: [], income: [] },
      [],
      w.movements,
    );
    expect(computeMonth(budget, "2026-10").totalSpent).toBe(0);
  });

  it("appears in cash flow separately, with unassigned income counted as other income", () => {
    const refund: Movement = { id: "r", type: "income", date: "2026-10-12", amount: 60, accountId: "monzo", source: "other", loggedAt: 2 };
    const salary: Movement = { id: "s", type: "income", date: "2026-10-28", amount: 3000, accountId: "monzo", source: "salary", budgetMonth: "2026-11", loggedAt: 3 };
    const transfer: Movement = { id: "t", type: "transfer", date: "2026-10-28", amount: 500, fromAccountId: "monzo", toAccountId: "saver", loggedAt: 4 };
    const movements = [holiday, refund, salary, transfer];
    const budget = makeEffectiveBudget(
      { categories: [], budgets: [], transactions: [], savingsAccounts: [], savingsEntries: [], income: [] },
      [],
      movements,
    );
    const [oct, nov] = cashFlowSeries(budget, "2026-10", "2026-11", movements);
    expect(oct).toMatchObject({ income: 0, otherIncome: 60, offBudget: 1200, totalIn: 60, totalOut: 1200, net: -1140 });
    // Salary counts in its budget month; the transfer appears nowhere.
    expect(nov).toMatchObject({ income: 3000, otherIncome: 0, offBudget: 0, totalIn: 3000, net: 3000 });
  });

  it("pulls the savings rate down but doesn't trigger the budget 'running hot' flag", () => {
    const budget = makeEffectiveBudget(
      {
        categories: [{ id: "n", name: "Rent", group: "Needs", typeSegments: [{ fromMonth: "2026-01", type: "Limit" }], archived: false }],
        budgets: [],
        transactions: ["2026-08", "2026-09", "2026-10"].map((m) => ({ id: m, categoryId: "n", date: `${m}-02`, amount: 1500 })),
        savingsAccounts: [],
        savingsEntries: [],
        income: ["2026-08", "2026-09"].map((month) => ({ month, netAmount: 3000 })),
      },
      [],
    );
    const big: Movement = { id: "big", type: "expense", date: "2026-09-15", amount: 1500, accountId: "saver", loggedAt: 1 };
    const r = healthReport({ wealth: state([], [big]), budget, month: "2026-10", today: "2026-10-20" });
    // Aug: 50% kept; Sep: 0% kept → (3000 − 2250) / 3000 = 25%.
    expect(r.averages.savingsRate).toBeCloseTo(0.25);
    expect(r.flags.some((f) => f.id === "spending-spike")).toBe(false);
  });
});

describe("store: recurring", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().resetAll();
  });

  it("validates templates", () => {
    const ids = new Set(["monzo", "amex"]);
    const cats = new Set(["c"]);
    expect(validTemplate({ kind: "spend", amount: 10, categoryId: "c" }, ids, cats)).toBe(true);
    expect(validTemplate({ kind: "spend", amount: 10, categoryId: "nope" }, ids, cats)).toBe(false);
    expect(validTemplate({ kind: "spend", amount: 0, categoryId: "c" }, ids, cats)).toBe(false);
    expect(validTemplate({ kind: "transfer", amount: 0, fromAccountId: "monzo", toAccountId: "amex", payFullBalance: true }, ids, cats)).toBe(true);
    expect(validTemplate({ kind: "transfer", amount: 5, fromAccountId: "monzo", toAccountId: "monzo" }, ids, cats)).toBe(false);
    expect(validTemplate({ kind: "expense", amount: 5, accountId: "ghost" }, ids, cats)).toBe(false);
  });

  it("adds, skips, pauses and deletes rules; deleting an account drops its rules", () => {
    const s = useAppStore.getState();
    const monzo = s.addAccount({ name: "Monzo", kind: "current", openingBalance: 0, date: "2026-10-01" });
    const id = s.addRecurring({ template: { kind: "expense", amount: 20, accountId: monzo }, day: 15, startMonth: "2026-10" })!;
    expect(s.addRecurring({ template: { kind: "expense", amount: 20, accountId: monzo }, day: 32, startMonth: "2026-10" })).toBeNull();
    s.skipOccurrence(id, "2026-10");
    s.skipOccurrence(id, "2026-10");
    expect(useAppStore.getState().wealth.recurring[0]!.skipped).toEqual(["2026-10"]);
    s.setRecurringPaused(id, true);
    expect(useAppStore.getState().wealth.recurring[0]!.paused).toBe(true);
    useAppStore.getState().deleteAccount(monzo);
    expect(useAppStore.getState().wealth.recurring).toEqual([]);
  });

  it("logged entries carry the rule id, so the reminder clears", () => {
    const s = useAppStore.getState();
    const monzo = s.addAccount({ name: "Monzo", kind: "current", openingBalance: 0, date: "2026-10-01" });
    const id = s.addRecurring({ template: { kind: "expense", amount: 20, accountId: monzo }, day: 15, startMonth: "2026-10" })!;
    const rule = useAppStore.getState().wealth.recurring[0]!;
    const e = entryFor(rule, "2026-10-15", 20);
    if (e.kind === "movement") useAppStore.getState().addMovement(e.input);
    const st = useAppStore.getState();
    expect(st.wealth.movements[0]!.recurringId).toBe(id);
    expect(occurrencesFor(st.wealth, st.budget.transactions, "2026-10", "2026-10-20")).toEqual([]);
  });
});
