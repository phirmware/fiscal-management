import { beforeEach, describe, expect, it } from "vitest";
import { computeMonth } from "../engine.js";
import { useAppStore } from "./store.js";
import { findPrefillBudget } from "./derived.js";
import { makeEffectiveBudget } from "./effectiveBudget.js";

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

  it("reallocation path 1: donor→recipient keeps totalBudgeted unchanged, baseline intact", () => {
    const { rent, fun } = seed();
    const baselineBefore = useAppStore.getState().budget;
    const before = computeMonth(baselineBefore, M);
    expect(before.totalBudgeted).toBe(900);
    expect(before.categories.find((c) => c.categoryId === fun)!.available).toBe(-30);

    useAppStore.getState().reallocateFromCategory(rent, fun, M, 30);

    // Baseline MonthlyBudget records are untouched — prefill for next month
    // still sees the original budgets.
    const baselineAfter = useAppStore.getState().budget;
    expect(baselineAfter.budgets).toEqual(baselineBefore.budgets);
    expect(useAppStore.getState().reallocations).toEqual([
      { categoryId: rent, month: M, delta: -30 },
      { categoryId: fun, month: M, delta: 30 },
    ]);

    // Engine, given the *effective* budget (baseline + reallocations), sees the fix.
    const effective = makeEffectiveBudget(baselineAfter, useAppStore.getState().reallocations);
    const after = computeMonth(effective, M);
    expect(after.totalBudgeted).toBe(900);
    expect(after.unallocated).toBe(before.unallocated);
    expect(after.categories.find((c) => c.categoryId === fun)!.available).toBe(0);
    expect(after.categories.find((c) => c.categoryId === rent)!.available).toBe(-30);
  });

  it("reallocation path 2: cover from unallocated reduces effective unallocated by amount", () => {
    const { fun } = seed();
    const baselineBefore = useAppStore.getState().budget;
    const before = computeMonth(baselineBefore, M);
    expect(before.unallocated).toBe(1100);

    useAppStore.getState().coverFromUnallocated(fun, M, 30);

    expect(useAppStore.getState().budget.budgets).toEqual(baselineBefore.budgets);
    expect(useAppStore.getState().reallocations).toEqual([
      { categoryId: fun, month: M, delta: 30 },
    ]);

    const effective = makeEffectiveBudget(
      useAppStore.getState().budget,
      useAppStore.getState().reallocations,
    );
    const after = computeMonth(effective, M);
    expect(after.unallocated).toBe(1070);
    expect(after.categories.find((c) => c.categoryId === fun)!.available).toBe(0);
  });

  it("reallocation in M does NOT leak into M+1's prefill", () => {
    const { rent, fun } = seed();
    // Rent baseline: 800 in M. No record for M+1 yet.
    useAppStore.getState().reallocateFromCategory(rent, fun, M, 30);

    // Pre-fix this was the bug: prefill for rent in M+1 would have shown 770,
    // because the donor's budget was directly mutated. With reallocations split
    // out, prefill sees the baseline 800.
    const source = {
      baseline: useAppStore.getState().budget.budgets,
      reallocations: useAppStore.getState().reallocations,
    };
    const next = "2026-06";
    const prefillRent = findPrefillBudget(source, rent, next);
    expect(prefillRent).toEqual({ amount: 800, sourceMonth: M });

    const prefillFun = findPrefillBudget(source, fun, next);
    expect(prefillFun).toEqual({ amount: 100, sourceMonth: M });
  });

  it("setBudget on a cell with a reallocation clears that cell's reallocations", () => {
    const { fun } = seed();
    useAppStore.getState().coverFromUnallocated(fun, M, 50);
    expect(useAppStore.getState().reallocations).toHaveLength(1);

    useAppStore.getState().setBudget(fun, M, 200);

    // The reallocation for fun/M was cleared; only the explicit budget remains.
    expect(useAppStore.getState().reallocations).toHaveLength(0);
    const baselineFun = useAppStore
      .getState()
      .budget.budgets.find((b) => b.categoryId === fun && b.month === M)!;
    expect(baselineFun.amount).toBe(200);
  });

  it("clearReallocations removes all reallocations for a (category, month)", () => {
    const { rent, fun } = seed();
    useAppStore.getState().reallocateFromCategory(rent, fun, M, 30);
    expect(useAppStore.getState().reallocations).toHaveLength(2);

    useAppStore.getState().clearReallocations(fun, M);
    // Only the fun entry was cleared; rent's reallocation still stands.
    expect(useAppStore.getState().reallocations).toEqual([
      { categoryId: rent, month: M, delta: -30 },
    ]);
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

  it("sendReleaseToCategory records a reallocation for the recipient and acknowledges the release", () => {
    const fun = useAppStore.getState().addCategory({
      name: "Fun",
      group: "Wants",
      type: "Limit",
      fromMonth: M,
    });
    const eatout = useAppStore.getState().addCategory({
      name: "Eatout",
      group: "Wants",
      type: "Pot",
      fromMonth: "2026-04",
    });
    useAppStore.getState().setBudget(fun, M, 100);
    useAppStore.getState().setBudget(eatout, "2026-04", 100);
    useAppStore.getState().convertCategoryType(eatout, M, "Limit");

    useAppStore.getState().sendReleaseToCategory(eatout, fun, M, 100);

    // Baseline fun budget stays at 100; the +100 lives as a reallocation only.
    const baselineFun = useAppStore
      .getState()
      .budget.budgets.find((b) => b.categoryId === fun && b.month === M)!;
    expect(baselineFun.amount).toBe(100);
    expect(useAppStore.getState().reallocations).toEqual([
      { categoryId: fun, month: M, delta: 100 },
    ]);
    expect(useAppStore.getState().releaseAcks).toEqual([{ categoryId: eatout, month: M }]);
  });

  it("acknowledgeRelease records the ack without changing engine output", () => {
    const fun = useAppStore.getState().addCategory({
      name: "Fun",
      group: "Wants",
      type: "Limit",
      fromMonth: M,
    });
    useAppStore.getState().setBudget(fun, M, 100);
    const before = computeMonth(useAppStore.getState().budget, M);
    useAppStore.getState().acknowledgeRelease(fun, M);
    const after = computeMonth(useAppStore.getState().budget, M);
    expect(after).toEqual(before);
    expect(useAppStore.getState().releaseAcks).toEqual([{ categoryId: fun, month: M }]);
  });

  it("completeOnboarding sets ui.hasOnboarded true", () => {
    expect(useAppStore.getState().ui.hasOnboarded).toBe(false);
    useAppStore.getState().completeOnboarding();
    expect(useAppStore.getState().ui.hasOnboarded).toBe(true);
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
