import { beforeEach, describe, expect, it } from "vitest";
import { computeMonth } from "../engine.js";
import { categoryRows, findPrefillBudget } from "./derived.js";
import { makeEffectiveBudget } from "./effectiveBudget.js";
import { allReallocations } from "./state.js";
import { useAppStore } from "./store.js";
import { accountViews, cashFlowSeries, netWorthAt } from "./wealth.js";

const OCT = "2026-10";
const NOV = "2026-11";

function freshStore() {
  localStorage.clear();
  useAppStore.getState().resetAll();
}

/** Gifts (Limit, £100/month from September) and a December pot (Pot) created in October. */
function seed() {
  const s = useAppStore.getState();
  const gifts = s.addCategory({ name: "Gifts", group: "Wants", type: "Limit", fromMonth: "2026-09" });
  const pot = s.addCategory({ name: "December pot", group: "Wants", type: "Pot", fromMonth: OCT });
  s.setIncome("2026-09", 2000);
  s.setIncome(OCT, 2000);
  s.setIncome(NOV, 2000);
  s.setBudget(gifts, "2026-09", 100);
  s.setBudget(gifts, OCT, 100);
  const current = s.addAccount({ name: "Current", kind: "current", openingBalance: 1000, date: "2026-10-01" });
  const saver = s.addAccount({ name: "Saver", kind: "savings", openingBalance: 500, date: "2026-10-01" });
  return { gifts, pot, current, saver };
}

function view(month: string) {
  const s = useAppStore.getState();
  const eff = makeEffectiveBudget(s.budget, s.reallocations, s.wealth.movements, s.wealth.moves);
  const source = { baseline: s.budget.budgets, reallocations: allReallocations(s.reallocations, s.wealth.moves) };
  const summary = computeMonth(eff, month);
  const rows = new Map(categoryRows(eff, source, summary, [], month).map((r) => [r.categoryId, r]));
  return { summary, rows, eff, source };
}

describe("budget moves", () => {
  beforeEach(freshStore);

  it("moves availability between categories without changing totals or spending", () => {
    const { gifts, pot } = seed();
    const before = view(OCT);
    useAppStore.getState().addMove({ date: "2026-10-05", amount: 5, fromCategoryId: gifts, toCategoryId: pot });
    useAppStore.getState().addMove({ date: "2026-10-06", amount: 7.5, fromCategoryId: gifts, toCategoryId: pot });
    const after = view(OCT);

    expect(after.rows.get(gifts)!.available).toBe(87.5);
    expect(after.rows.get(pot)!.available).toBe(12.5);
    expect(after.summary.totalBudgeted).toBe(before.summary.totalBudgeted);
    expect(after.summary.unallocated).toBe(before.summary.unallocated);
    expect(after.summary.totalSpent).toBe(0);
    // Not spending: cash flow is identical.
    expect(cashFlowSeries(after.eff, OCT, OCT)).toEqual(cashFlowSeries(before.eff, OCT, OCT));
  });

  it("the pot carries the money forward; the Limit category resets to its plan", () => {
    const { gifts, pot } = seed();
    useAppStore.getState().addMove({ date: "2026-10-05", amount: 20, fromCategoryId: gifts, toCategoryId: pot });
    const nov = view(NOV);
    expect(nov.rows.get(pot)!.carryIn).toBe(20);
    expect(nov.rows.get(pot)!.available).toBe(20);
    // Gifts' November suggestion is still the £100 plan, not £80.
    expect(findPrefillBudget(nov.source, gifts, NOV)).toEqual({ amount: 100, sourceMonth: OCT });
    expect(nov.rows.get(gifts)!.available).toBe(100);
  });

  it("lands on top of a suggested (prefilled) budget instead of replacing it", () => {
    const { gifts, pot } = seed();
    // November has no Gifts budget yet: the UI shows £100 carried over from October.
    expect(view(NOV).rows.get(gifts)!.budgeted).toBe(100);
    useAppStore.getState().addMove({ date: "2026-11-02", amount: 30, fromCategoryId: gifts, toCategoryId: pot });
    const nov = view(NOV);
    expect(nov.rows.get(gifts)!.budgeted).toBe(70);
    expect(nov.rows.get(gifts)!.adjustment).toBe(-30);
    expect(nov.rows.get(gifts)!.available).toBe(70);
    expect(nov.rows.get(pot)!.available).toBe(30);
    // The suggestion was saved as November's plan, unchanged.
    const b = useAppStore.getState().budget.budgets.find((x) => x.categoryId === gifts && x.month === NOV);
    expect(b?.amount).toBe(100);
    expect(nov.summary.unallocated).toBe(2000 - 100);
  });

  it("reports the planned budget separately from this month's moves", () => {
    const { gifts, pot } = seed();
    useAppStore.getState().addMove({ date: "2026-10-05", amount: 20, fromCategoryId: gifts, toCategoryId: pot });
    const r = view(OCT).rows;
    expect(r.get(gifts)!.budgeted - r.get(gifts)!.adjustment).toBe(100);
    expect(r.get(pot)!.budgeted - r.get(pot)!.adjustment).toBe(0);
    // Re-saving the planned figure (what the edit box now shows) changes nothing.
    useAppStore.getState().setBudget(gifts, OCT, 100);
    expect(view(OCT).rows.get(gifts)!.available).toBe(80);
  });

  it("rejects moves the budget can't net to zero", () => {
    const { gifts, pot, current, saver } = seed();
    const add = useAppStore.getState().addMove;
    const base = { date: "2026-10-05", amount: 10, fromCategoryId: gifts, toCategoryId: pot };
    expect(add({ ...base, amount: 0 })).toBeNull();
    expect(add({ ...base, amount: -5 })).toBeNull();
    expect(add({ ...base, amount: Number.NaN })).toBeNull();
    expect(add({ ...base, toCategoryId: gifts })).toBeNull();
    expect(add({ ...base, toCategoryId: "missing" })).toBeNull();
    // The pot only exists from October.
    expect(add({ ...base, date: "2026-09-20" })).toBeNull();
    expect(add({ ...base, fromAccountId: current })).toBeNull();
    expect(add({ ...base, fromAccountId: current, toAccountId: current })).toBeNull();
    expect(add({ ...base, fromAccountId: current, toAccountId: "missing" })).toBeNull();
    useAppStore.getState().archiveCategory(pot, true);
    expect(add(base)).toBeNull();
    useAppStore.getState().archiveCategory(pot, false);
    expect(add({ ...base, fromAccountId: current, toAccountId: saver })).not.toBeNull();
    expect(useAppStore.getState().wealth.moves).toHaveLength(1);
  });

  it("budget-only moves leave every balance alone", () => {
    const { gifts, pot } = seed();
    const s = useAppStore.getState();
    const before = netWorthAt(s.wealth, "2026-10-31").netWorth;
    s.addMove({ date: "2026-10-05", amount: 50, fromCategoryId: gifts, toCategoryId: pot });
    expect(netWorthAt(useAppStore.getState().wealth, "2026-10-31").netWorth).toBe(before);
    const views = accountViews(useAppStore.getState().wealth, "2026-10-31", "2026-10-31");
    expect(views.map((v) => v.balance)).toEqual([1000, 500]);
  });

  it("moves with accounts shift balances like a transfer; net worth is unchanged", () => {
    const { gifts, pot, current, saver } = seed();
    const s = useAppStore.getState();
    s.addMove({ date: "2026-10-05", amount: 5, fromCategoryId: gifts, toCategoryId: pot, fromAccountId: current, toAccountId: saver });
    s.addMove({ date: "2026-10-06", amount: 5, fromCategoryId: gifts, toCategoryId: pot, fromAccountId: current, toAccountId: saver });
    const w = useAppStore.getState().wealth;
    const [cur, sav] = accountViews(w, "2026-10-31", "2026-10-31");
    expect(cur!.balance).toBe(990);
    expect(sav!.balance).toBe(510);
    expect(netWorthAt(w, "2026-10-31").netWorth).toBe(1500);
  });

  it("a move before the latest check-in is assumed already in that balance", () => {
    const { gifts, pot, current, saver } = seed();
    const s = useAppStore.getState();
    s.addMove({ date: "2026-10-05", amount: 40, fromCategoryId: gifts, toCategoryId: pot, fromAccountId: current, toAccountId: saver });
    s.recordBalance({ accountId: saver, date: "2026-10-10", balance: 540 });
    const sav = accountViews(useAppStore.getState().wealth, "2026-10-31", "2026-10-31")[1]!;
    expect(sav.balance).toBe(540);
    expect(sav.reconciliation[useAppStore.getState().wealth.snapshots.find((x) => x.date === "2026-10-10")!.id]?.gap).toBe(0);
  });

  it("editing keeps the log time; deleting reverses both sides", () => {
    const { gifts, pot, current, saver } = seed();
    const s = useAppStore.getState();
    const id = s.addMove({ date: "2026-10-05", amount: 10, fromCategoryId: gifts, toCategoryId: pot, fromAccountId: current, toAccountId: saver })!;
    const loggedAt = useAppStore.getState().wealth.moves[0]!.loggedAt;
    expect(s.editMove(id, { date: "2026-10-05", amount: 25, fromCategoryId: gifts, toCategoryId: pot })).toBe(true);
    const mv = useAppStore.getState().wealth.moves[0]!;
    expect(mv.loggedAt).toBe(loggedAt);
    expect(mv.amount).toBe(25);
    expect(mv.fromAccountId).toBeUndefined();
    expect(view(OCT).rows.get(gifts)!.available).toBe(75);

    s.deleteMove(id);
    expect(view(OCT).rows.get(gifts)!.available).toBe(100);
    expect(view(OCT).rows.get(pot)!.available).toBe(0);
  });

  it("deleting an account keeps the budget side of its moves", () => {
    const { gifts, pot, current, saver } = seed();
    const s = useAppStore.getState();
    s.addMove({ date: "2026-10-05", amount: 10, fromCategoryId: gifts, toCategoryId: pot, fromAccountId: current, toAccountId: saver });
    s.deleteAccount(saver);
    const mv = useAppStore.getState().wealth.moves[0]!;
    expect(mv.fromAccountId).toBeUndefined();
    expect(mv.toAccountId).toBeUndefined();
    expect(view(OCT).rows.get(pot)!.available).toBe(10);
    expect(accountViews(useAppStore.getState().wealth, "2026-10-31", "2026-10-31")[0]!.balance).toBe(1000);
  });

  it("round-trips through backups, and older backups load without moves", () => {
    const { gifts, pot } = seed();
    const s = useAppStore.getState();
    s.addMove({ date: "2026-10-05", amount: 10, fromCategoryId: gifts, toCategoryId: pot, note: "Birthday" });
    const json = s.exportJson();
    freshStore();
    useAppStore.getState().importJson(json);
    expect(useAppStore.getState().wealth.moves).toHaveLength(1);
    expect(useAppStore.getState().wealth.moves[0]!.note).toBe("Birthday");

    const old = JSON.parse(json);
    delete old.wealth.moves;
    useAppStore.getState().importJson(JSON.stringify(old));
    expect(useAppStore.getState().wealth.moves).toEqual([]);
  });
});
