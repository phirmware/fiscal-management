import { beforeEach, describe, expect, it } from "vitest";
import { computeMonth } from "../engine.js";
import { useAppStore } from "./store.js";

const M = "2026-05";

function freshStore() {
  localStorage.clear();
  useAppStore.getState().resetAll();
}

function seed() {
  const s = useAppStore.getState();
  const rent = s.addCategory({ name: "Rent", group: "Needs", type: "Limit", fromMonth: M });
  const fun = s.addCategory({ name: "Fun", group: "Wants", type: "Limit", fromMonth: M });
  s.setIncome(M, 2000);
  s.setBudget(rent, M, 800);
  s.setBudget(fun, M, 100);
  s.addTransaction({ categoryId: rent, date: "2026-05-01", amount: 800 });
  s.addTransaction({ categoryId: fun, date: "2026-05-10", amount: 130 });
  return { rent, fun };
}

describe("app store", () => {
  beforeEach(() => {
    freshStore();
  });

  it("reallocation path 1: donor→recipient keeps totalBudgeted unchanged", () => {
    const { rent, fun } = seed();
    const before = computeMonth(useAppStore.getState().budget, M);
    expect(before.totalBudgeted).toBe(900);
    expect(before.categories.find((c) => c.categoryId === fun)!.available).toBe(-30);

    useAppStore.getState().reallocateFromCategory(rent, fun, M, 30);

    const after = computeMonth(useAppStore.getState().budget, M);
    expect(after.totalBudgeted).toBe(900);
    expect(after.unallocated).toBe(before.unallocated);
    expect(after.categories.find((c) => c.categoryId === fun)!.available).toBe(0);
    expect(after.categories.find((c) => c.categoryId === rent)!.available).toBe(-30);
  });

  it("reallocation path 2: cover from unallocated reduces engine.unallocated by amount", () => {
    const { fun } = seed();
    const before = computeMonth(useAppStore.getState().budget, M);
    expect(before.unallocated).toBe(1100);

    useAppStore.getState().coverFromUnallocated(fun, M, 30);

    const after = computeMonth(useAppStore.getState().budget, M);
    expect(after.unallocated).toBe(1070);
    expect(after.categories.find((c) => c.categoryId === fun)!.available).toBe(0);
  });

  it("acknowledgeOverspend does NOT change engine output", () => {
    const { fun } = seed();
    const before = computeMonth(useAppStore.getState().budget, M);
    useAppStore.getState().acknowledgeOverspend(fun, M);
    const after = computeMonth(useAppStore.getState().budget, M);
    expect(after).toEqual(before);
    expect(useAppStore.getState().overspendAcks).toEqual([{ categoryId: fun, month: M }]);
  });

  it("editing a transaction makes the engine recompute on the next call", () => {
    const { fun } = seed();
    const txnId = useAppStore.getState().budget.transactions.find((t) => t.categoryId === fun)!.id;

    useAppStore.getState().editTransaction(txnId, { amount: 50 });
    const after = computeMonth(useAppStore.getState().budget, M);
    expect(after.categories.find((c) => c.categoryId === fun)!.spent).toBe(50);
    expect(after.categories.find((c) => c.categoryId === fun)!.available).toBe(50);
  });

  it("convertCategoryType keeps segments sorted and triggers conversion logic", () => {
    const id = useAppStore.getState().addCategory({
      name: "Eating out",
      group: "Wants",
      type: "Pot",
      fromMonth: "2026-01",
    });
    useAppStore.getState().setBudget(id, "2026-01", 100);
    useAppStore.getState().addTransaction({ categoryId: id, date: "2026-01-05", amount: 30 });

    useAppStore.getState().convertCategoryType(id, "2026-02", "Limit");

    const summary = computeMonth(useAppStore.getState().budget, "2026-02");
    expect(summary.releasedFromConversions).toBe(70);
    const cat = summary.categories.find((c) => c.categoryId === id)!;
    expect(cat.type).toBe("Limit");
    expect(cat.carryIn).toBe(0);
  });

  it("setBudget(0) keeps an explicit zero record (so prefill stays suppressed)", () => {
    const fun = useAppStore.getState().addCategory({
      name: "Fun",
      group: "Wants",
      type: "Limit",
      fromMonth: "2026-04",
    });
    useAppStore.getState().setBudget(fun, "2026-04", 80);
    useAppStore.getState().setBudget(fun, "2026-05", 0);
    const budgets = useAppStore.getState().budget.budgets.filter((b) => b.categoryId === fun);
    expect(budgets).toHaveLength(2);
    const may = budgets.find((b) => b.month === "2026-05")!;
    expect(may.amount).toBe(0);
  });

  it("setSavingsEntry upserts; deleting with amount 0 removes it", () => {
    const id = useAppStore.getState().addSavingsAccount({ name: "Holiday", startingBalance: 0 });
    useAppStore.getState().setSavingsEntry(id, M, 100);
    expect(useAppStore.getState().budget.savingsEntries).toHaveLength(1);
    useAppStore.getState().setSavingsEntry(id, M, 150);
    expect(useAppStore.getState().budget.savingsEntries).toHaveLength(1);
    expect(useAppStore.getState().budget.savingsEntries[0]!.amount).toBe(150);
    useAppStore.getState().setSavingsEntry(id, M, 0);
    expect(useAppStore.getState().budget.savingsEntries).toHaveLength(0);
  });

  it("exportJson → importJson reproduces engine output across full state", () => {
    seed();
    const s = useAppStore.getState();
    const json = s.exportJson();
    const before = computeMonth(s.budget, M);

    s.resetAll();
    expect(useAppStore.getState().budget.categories).toEqual([]);

    useAppStore.getState().importJson(json);
    const after = computeMonth(useAppStore.getState().budget, M);
    expect(after).toEqual(before);
  });
});
