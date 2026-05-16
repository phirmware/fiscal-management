import { describe, expect, it } from "vitest";
import { computeMonth, computeSavings } from "../engine.js";
import type { BudgetState } from "../types.js";
import {
  categoryStatus,
  fiftyThirtyTwentyBenchmark,
  groupTotals,
  monthBreakdown,
  notYetAssigned,
  overspends,
  reallocationDonors,
  unresolvedOverspends,
} from "./derived.js";

const M = "2026-05";

function baseState(): BudgetState {
  return {
    categories: [
      {
        id: "rent",
        name: "Rent",
        group: "Needs",
        archived: false,
        typeSegments: [{ fromMonth: M, type: "Limit" }],
      },
      {
        id: "groceries",
        name: "Groceries",
        group: "Needs",
        archived: false,
        typeSegments: [{ fromMonth: M, type: "Limit" }],
      },
      {
        id: "fun",
        name: "Fun money",
        group: "Wants",
        archived: false,
        typeSegments: [{ fromMonth: M, type: "Pot" }],
      },
    ],
    budgets: [
      { categoryId: "rent", month: M, amount: 800 },
      { categoryId: "groceries", month: M, amount: 300 },
      { categoryId: "fun", month: M, amount: 100 },
    ],
    transactions: [
      { id: "t1", categoryId: "rent", date: "2026-05-01", amount: 800 },
      { id: "t2", categoryId: "groceries", date: "2026-05-10", amount: 340 },
      { id: "t3", categoryId: "fun", date: "2026-05-12", amount: 40 },
    ],
    savingsAccounts: [{ id: "emergency", name: "Emergency", startingBalance: 0 }],
    savingsEntries: [{ accountId: "emergency", month: M, amount: 200 }],
    income: [{ month: M, netAmount: 2000 }],
  };
}

describe("derived helpers", () => {
  it("notYetAssigned = engine.unallocated - savingsThisMonth", () => {
    const s = baseState();
    const m = computeMonth(s, M);
    const sav = computeSavings(s, M);
    expect(m.unallocated).toBe(2000 - 1200);
    expect(sav.monthTotal).toBe(200);
    expect(notYetAssigned(m, sav)).toBe(600);
  });

  it("monthBreakdown surfaces income, budgeted, savings, notYetAssigned", () => {
    const s = baseState();
    const breakdown = monthBreakdown(computeMonth(s, M), computeSavings(s, M));
    expect(breakdown).toEqual({
      income: 2000,
      budgeted: 1200,
      savings: 200,
      notYetAssigned: 600,
    });
  });

  it("overspends flags categories with negative available, separates acked vs unacked", () => {
    const s = baseState();
    const m = computeMonth(s, M);
    const all = overspends(s, m, [], M);
    expect(all).toHaveLength(1);
    expect(all[0]!.categoryId).toBe("groceries");
    expect(all[0]!.amount).toBe(40);
    expect(all[0]!.acknowledged).toBe(false);

    const acked = overspends(s, m, [{ categoryId: "groceries", month: M }], M);
    expect(acked[0]!.acknowledged).toBe(true);

    const unresolved = unresolvedOverspends(
      s,
      m,
      [{ categoryId: "groceries", month: M }],
      M,
    );
    expect(unresolved).toHaveLength(0);
  });

  it("categoryStatus buckets correctly", () => {
    expect(
      categoryStatus({
        categoryId: "x",
        type: "Limit",
        budgeted: 100,
        spent: 0,
        carryIn: 0,
        available: 100,
      }),
    ).toBe("ok");
    expect(
      categoryStatus({
        categoryId: "x",
        type: "Limit",
        budgeted: 100,
        spent: 95,
        carryIn: 0,
        available: 5,
      }),
    ).toBe("close");
    expect(
      categoryStatus({
        categoryId: "x",
        type: "Limit",
        budgeted: 100,
        spent: 130,
        carryIn: 0,
        available: -30,
      }),
    ).toBe("over");
    expect(
      categoryStatus({
        categoryId: "x",
        type: "Limit",
        budgeted: 0,
        spent: 0,
        carryIn: 0,
        available: 0,
      }),
    ).toBe("empty");
  });

  it("groupTotals sums spending by group and adds savings entries", () => {
    const s = baseState();
    const totals = groupTotals(s, computeMonth(s, M), computeSavings(s, M));
    expect(totals.needs).toBe(1140);
    expect(totals.wants).toBe(40);
    expect(totals.savings).toBe(200);
  });

  it("fiftyThirtyTwentyBenchmark returns split of income", () => {
    expect(fiftyThirtyTwentyBenchmark(2000)).toEqual({ needs: 1000, wants: 600, savings: 400 });
  });

  it("reallocationDonors lists categories with enough available", () => {
    const s = baseState();
    const m = computeMonth(s, M);
    const donors = reallocationDonors(s, m, "groceries", 40);
    expect(donors.map((d) => d.categoryId)).toContain("fun");
    expect(donors.map((d) => d.categoryId)).not.toContain("groceries");

    const tooBig = reallocationDonors(s, m, "groceries", 9999);
    expect(tooBig).toHaveLength(0);
  });
});
