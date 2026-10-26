import { beforeEach, describe, expect, it } from "vitest";
import type { BudgetState, Transaction } from "../types.js";
import { computeMonth } from "../engine.js";
import type { BalanceSnapshot, Movement, WealthAccount, WealthState } from "./state.js";
import { linkedIncome, makeEffectiveBudget, mergeIncome } from "./effectiveBudget.js";
import { useAppStore, validMovement } from "./store.js";
import { accountViews, balanceOn, buildLedger, isAfterCheckIn, netWorthAt, netWorthSeries } from "./wealth.js";

const T0 = 1_000_000; // a check-in's recordedAt
const acc = (id: string, kind: WealthAccount["kind"], extra: Partial<WealthAccount> = {}): WealthAccount => ({
  id,
  name: id,
  kind,
  archived: false,
  createdAt: "2026-01-01",
  ...extra,
});
const snap = (accountId: string, date: string, balance: number, recordedAt?: number): BalanceSnapshot => ({
  id: `${accountId}-${date}`,
  accountId,
  date,
  balance,
  ...(recordedAt !== undefined ? { recordedAt } : {}),
});
const spend = (id: string, accountId: string, date: string, amount: number, loggedAt?: number): Transaction => ({
  id,
  categoryId: "groc",
  date,
  amount,
  accountId,
  ...(loggedAt !== undefined ? { loggedAt } : {}),
});
const w = (accounts: WealthAccount[], snapshots: BalanceSnapshot[], movements: Movement[] = []): WealthState => ({
  accounts,
  snapshots,
  movements,
  recurring: [],
  profile: { emergencyMonthsTarget: 6 },
});

describe("ledger flows", () => {
  const accounts = [acc("monzo", "current"), acc("amex", "creditCard", { paysInFull: true }), acc("saver", "savings")];

  it("walks through a month: salary in, card spending, card repaid in full", () => {
    const state = w(
      accounts,
      [snap("monzo", "2026-10-01", 500), snap("amex", "2026-10-01", 0), snap("saver", "2026-10-01", 5000)],
      [
        { id: "sal", type: "income", date: "2026-10-28", amount: 3200, accountId: "monzo", source: "salary", loggedAt: 1 },
        { id: "rep", type: "transfer", date: "2026-10-30", amount: 640, fromAccountId: "monzo", toAccountId: "amex", loggedAt: 2 },
        { id: "sav", type: "transfer", date: "2026-10-30", amount: 500, fromAccountId: "monzo", toAccountId: "saver", loggedAt: 3 },
      ],
    );
    const txns = [
      spend("g1", "amex", "2026-10-05", 120),
      spend("g2", "amex", "2026-10-12", 520),
      spend("r1", "monzo", "2026-10-02", 400),
    ];
    const ledger = buildLedger(state, txns);

    // Mid-month: card has built up, current account paid rent.
    expect(balanceOn(ledger, "amex", "2026-10-20")!.balance).toBe(640);
    expect(balanceOn(ledger, "monzo", "2026-10-20")!.balance).toBe(100);

    // Month end: card cleared, salary in, savings moved.
    expect(balanceOn(ledger, "amex", "2026-10-31")!.balance).toBe(0);
    expect(balanceOn(ledger, "monzo", "2026-10-31")!.balance).toBe(500 - 400 + 3200 - 640 - 500);
    expect(balanceOn(ledger, "saver", "2026-10-31")!.balance).toBe(5500);

    // Net worth moves only by income − spending: 5500 + 3200 − 1040.
    expect(netWorthAt(state, "2026-10-31", ledger).netWorth).toBe(5500 + 3200 - 1040);
  });

  it("transfers never change net worth", () => {
    const state = w(
      accounts,
      [snap("monzo", "2026-10-01", 2000), snap("amex", "2026-10-01", 700), snap("saver", "2026-10-01", 100)],
      [
        { id: "a", type: "transfer", date: "2026-10-10", amount: 700, fromAccountId: "monzo", toAccountId: "amex", loggedAt: 1 },
        { id: "b", type: "transfer", date: "2026-10-11", amount: 333.33, fromAccountId: "monzo", toAccountId: "saver", loggedAt: 2 },
      ],
    );
    const before = netWorthAt(state, "2026-10-01").netWorth;
    const after = netWorthAt(state, "2026-10-31").netWorth;
    expect(after).toBe(before);
    expect(netWorthAt(state, "2026-10-31").liabilities).toBe(0);
  });

  it("ignores spending with no account and entries pointing at unknown accounts", () => {
    const state = w([acc("monzo", "current")], [snap("monzo", "2026-10-01", 1000)], [
      { id: "x", type: "income", date: "2026-10-05", amount: 50, accountId: "ghost", source: "other", loggedAt: 1 },
    ]);
    const txns: Transaction[] = [
      { id: "t", categoryId: "c", date: "2026-10-03", amount: 99 },
      spend("t2", "ghost", "2026-10-03", 10),
    ];
    expect(balanceOn(buildLedger(state, txns), "monzo", "2026-10-31")!.balance).toBe(1000);
  });

  it("refunds (negative spending) increase an asset and reduce a card balance", () => {
    const state = w([acc("monzo", "current"), acc("cc", "creditCard")], [
      snap("monzo", "2026-10-01", 100),
      snap("cc", "2026-10-01", 300),
    ]);
    const ledger = buildLedger(state, [spend("r", "monzo", "2026-10-02", -25), spend("r2", "cc", "2026-10-02", -40)]);
    expect(balanceOn(ledger, "monzo", "2026-10-31")!.balance).toBe(125);
    expect(balanceOn(ledger, "cc", "2026-10-31")!.balance).toBe(260);
  });

  it("does not drift with pennies", () => {
    const state = w([acc("monzo", "current")], [snap("monzo", "2026-10-01", 0)]);
    const txns = Array.from({ length: 30 }, (_, i) => spend(`p${i}`, "monzo", "2026-10-02", 0.1));
    expect(balanceOn(buildLedger(state, txns), "monzo", "2026-10-31")!.balance).toBe(-3);
  });

  it("caps the current month at today so future-dated entries don't count yet", () => {
    const state = w([acc("monzo", "current")], [snap("monzo", "2026-10-01", 1000)], [
      { id: "s", type: "income", date: "2026-10-28", amount: 3000, accountId: "monzo", source: "salary", loggedAt: 1 },
    ]);
    const [oct] = netWorthSeries(state, "2026-10", "2026-10", [], "2026-10-25");
    expect(oct!.netWorth).toBe(1000);
    const [octEnd] = netWorthSeries(state, "2026-10", "2026-10");
    expect(octEnd!.netWorth).toBe(4000);
  });
});

describe("check-ins reset the estimate", () => {
  const accounts = [acc("monzo", "current")];

  it("entries dated before a check-in are already in it", () => {
    const state = w(accounts, [snap("monzo", "2026-10-01", 1000), snap("monzo", "2026-10-15", 700)]);
    const txns = [spend("a", "monzo", "2026-10-05", 300), spend("b", "monzo", "2026-10-20", 50)];
    const b = balanceOn(buildLedger(state, txns), "monzo", "2026-10-31")!;
    expect(b.anchor.date).toBe("2026-10-15");
    expect(b.pending.map((f) => f.sourceId)).toEqual(["b"]);
    expect(b.balance).toBe(650);
  });

  it("same day: entries logged before the check-in are included, after it are not", () => {
    const s = snap("monzo", "2026-10-15", 700, T0);
    expect(isAfterCheckIn({ date: "2026-10-15", loggedAt: T0 - 1 }, s)).toBe(false);
    expect(isAfterCheckIn({ date: "2026-10-15", loggedAt: T0 + 1 }, s)).toBe(true);
    // Missing timestamps → assume included (can't double-count).
    expect(isAfterCheckIn({ date: "2026-10-15" }, s)).toBe(false);
    expect(isAfterCheckIn({ date: "2026-10-15", loggedAt: T0 + 1 }, snap("monzo", "2026-10-15", 700))).toBe(false);
    expect(isAfterCheckIn({ date: "2026-10-14", loggedAt: T0 + 99 }, s)).toBe(false);
    expect(isAfterCheckIn({ date: "2026-10-16" }, s)).toBe(true);
  });

  it("reports how each check-in compared with what was logged", () => {
    const state = w(accounts, [
      snap("monzo", "2026-10-01", 1000, T0),
      snap("monzo", "2026-10-31", 562, T0 + 100),
      snap("monzo", "2026-11-30", 900, T0 + 200),
    ]);
    const txns = [spend("a", "monzo", "2026-10-05", 300), spend("b", "monzo", "2026-10-20", 100)];
    const [v] = accountViews(state, "2026-11-30", "2026-11-30", txns);
    // Expected 1000 − 400 = 600; actual 562 → £38 not logged.
    expect(v!.reconciliation["monzo-2026-10-31"]).toEqual({ expected: 600, gap: -38, entries: 2 });
    // November had no entries → no reconciliation claimed.
    expect(v!.reconciliation["monzo-2026-11-30"]).toBeUndefined();
    expect(v!.estimated).toBe(false);
    expect(v!.balance).toBe(900);
  });

  it("marks a view as estimated and exposes the check-in balance", () => {
    const state = w(accounts, [snap("monzo", "2026-10-01", 1000)]);
    const [v] = accountViews(state, "2026-10-25", "2026-10-25", [spend("a", "monzo", "2026-10-05", 300)]);
    expect(v!.estimated).toBe(true);
    expect(v!.checkInBalance).toBe(1000);
    expect(v!.balance).toBe(700);
    expect(v!.signed).toBe(700);
  });
});

describe("budget income from logged salary", () => {
  const budget = (): BudgetState => ({
    categories: [],
    budgets: [],
    transactions: [],
    savingsAccounts: [],
    savingsEntries: [],
    income: [{ month: "2026-10", netAmount: 2500 }, { month: "2026-11", netAmount: 2500 }],
  });
  const income = (id: string, amount: number, budgetMonth?: string): Movement => ({
    id,
    type: "income",
    date: "2026-10-28",
    amount,
    accountId: "monzo",
    source: "salary",
    ...(budgetMonth ? { budgetMonth } : {}),
    loggedAt: 1,
  });

  it("replaces the manual figure only for months with logged income", () => {
    const eff = makeEffectiveBudget(budget(), [], [income("a", 3200, "2026-11"), income("b", 150.55, "2026-11")]);
    expect(computeMonth(eff, "2026-10").income).toBe(2500);
    expect(computeMonth(eff, "2026-11").income).toBe(3350.55);
  });

  it("income without a budget month (e.g. a refund) never touches the budget", () => {
    const eff = makeEffectiveBudget(budget(), [], [income("r", 40)]);
    expect(computeMonth(eff, "2026-10").income).toBe(2500);
    expect(linkedIncome([income("r", 40)]).size).toBe(0);
  });

  it("deleting the logged income brings the manual figure back", () => {
    expect(mergeIncome(budget().income, [])).toEqual(budget().income);
  });

  it("creates income for a month that had none", () => {
    const b = budget();
    b.income = [];
    const eff = makeEffectiveBudget(b, [], [income("a", 3000, "2026-12")]);
    const m = computeMonth(eff, "2026-12");
    expect(m.income).toBe(3000);
    expect(m.incomeSet).toBe(true);
  });
});

describe("store: movements", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().resetAll();
  });

  const setup = () => {
    const s = useAppStore.getState();
    const monzo = s.addAccount({ name: "Monzo", kind: "current", openingBalance: 100, date: "2026-10-01" });
    const amex = s.addAccount({ name: "Amex", kind: "creditCard", openingBalance: 0, date: "2026-10-01" });
    return { monzo, amex };
  };

  it("rejects invalid movements", () => {
    const { monzo, amex } = setup();
    const ids = new Set([monzo, amex]);
    const base = { date: "2026-10-02", loggedAt: 1 };
    expect(validMovement({ ...base, type: "transfer", amount: 10, fromAccountId: monzo, toAccountId: monzo }, ids)).toBe(false);
    expect(validMovement({ ...base, type: "transfer", amount: 0, fromAccountId: monzo, toAccountId: amex }, ids)).toBe(false);
    expect(validMovement({ ...base, type: "income", amount: -5, accountId: monzo, source: "other" }, ids)).toBe(false);
    expect(validMovement({ ...base, type: "income", amount: Number.NaN, accountId: monzo, source: "other" }, ids)).toBe(false);
    expect(validMovement({ ...base, type: "income", amount: 5, accountId: "ghost", source: "other" }, ids)).toBe(false);
    expect(useAppStore.getState().addMovement({ ...base, type: "income", amount: -5, accountId: monzo, source: "other" })).toBeNull();
    expect(useAppStore.getState().wealth.movements).toEqual([]);
  });

  it("edit keeps the original log time", () => {
    const { monzo } = setup();
    const s = useAppStore.getState();
    const id = s.addMovement({ type: "income", date: "2026-10-28", amount: 3200, accountId: monzo, source: "salary", budgetMonth: "2026-11" })!;
    const loggedAt = useAppStore.getState().wealth.movements[0]!.loggedAt;
    expect(s.editMovement(id, { type: "income", date: "2026-10-28", amount: 3250, accountId: monzo, source: "salary", budgetMonth: "2026-11" })).toBe(true);
    const m = useAppStore.getState().wealth.movements[0]!;
    expect(m.amount).toBe(3250);
    expect(m.loggedAt).toBe(loggedAt);
  });

  it("deleting an account removes its movements and unlinks its spending", () => {
    const { monzo, amex } = setup();
    const s = useAppStore.getState();
    const cat = s.addCategory({ name: "Food", group: "Needs", type: "Limit", fromMonth: "2026-10" });
    s.addTransaction({ categoryId: cat, date: "2026-10-03", amount: 20, accountId: amex });
    s.addMovement({ type: "transfer", date: "2026-10-30", amount: 20, fromAccountId: monzo, toAccountId: amex });
    s.addMovement({ type: "income", date: "2026-10-28", amount: 1000, accountId: monzo, source: "salary" });
    useAppStore.getState().deleteAccount(amex);
    const st = useAppStore.getState();
    expect(st.wealth.movements.map((m) => m.type)).toEqual(["income"]);
    expect(st.budget.transactions[0]!.accountId).toBeUndefined();
    expect("accountId" in st.budget.transactions[0]!).toBe(false);
    // Budget spending itself is untouched.
    expect(computeMonth(st.budget, "2026-10").totalSpent).toBe(20);
  });

  it("clearing 'paid with' on edit removes the link", () => {
    const { amex } = setup();
    const s = useAppStore.getState();
    const cat = s.addCategory({ name: "Food", group: "Needs", type: "Limit", fromMonth: "2026-10" });
    const id = s.addTransaction({ categoryId: cat, date: "2026-10-03", amount: 20, accountId: amex });
    s.editTransaction(id, { accountId: undefined });
    expect("accountId" in useAppStore.getState().budget.transactions[0]!).toBe(false);
  });

  it("stamps today's check-ins but not backdated ones", () => {
    const { monzo } = setup();
    const s = useAppStore.getState();
    s.recordBalance({ accountId: monzo, date: "2020-01-01", balance: 5 });
    const old = useAppStore.getState().wealth.snapshots.find((x) => x.date === "2020-01-01")!;
    expect(old.recordedAt).toBeUndefined();
  });

  it("round-trips movements and account links through backup", () => {
    const { monzo, amex } = setup();
    const s = useAppStore.getState();
    s.addMovement({ type: "transfer", date: "2026-10-30", amount: 20, fromAccountId: monzo, toAccountId: amex });
    const json = s.exportJson();
    s.resetAll();
    useAppStore.getState().importJson(json);
    expect(useAppStore.getState().wealth.movements).toHaveLength(1);
  });
});
