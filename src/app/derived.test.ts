import { describe, expect, it } from "vitest";
import { computeMonth, computeSavings } from "../engine.js";
import type { BudgetState } from "../types.js";
import {
  categoryRows,
  categoryStatus,
  findPrefillBudget,
  fiftyThirtyTwentyBenchmark,
  groupTotals,
  monthBreakdown,
  notYetAssigned,
  overspends,
  reallocationDonors,
  unresolvedOverspends,
} from "./derived.js";

const M = "2026-05";
const PREV = "2026-04";
const PRIOR = "2026-03";

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

  it("overspends flags categories with negative display-available", () => {
    const s = baseState();
    const m = computeMonth(s, M);
    const rows = categoryRows(s, m, [], M);
    const all = overspends(rows);
    expect(all).toHaveLength(1);
    expect(all[0]!.categoryId).toBe("groceries");
    expect(all[0]!.amount).toBe(40);
    expect(all[0]!.acknowledged).toBe(false);

    const ackedRows = categoryRows(s, m, [{ categoryId: "groceries", month: M }], M);
    expect(overspends(ackedRows)[0]!.acknowledged).toBe(true);
    expect(unresolvedOverspends(ackedRows)).toHaveLength(0);
  });

  it("categoryStatus buckets correctly", () => {
    expect(
      categoryStatus({
        type: "Limit",
        budgeted: 100,
        spent: 0,
        carryIn: 0,
        available: 100,
      }),
    ).toBe("ok");
    expect(
      categoryStatus({
        type: "Limit",
        budgeted: 100,
        spent: 95,
        carryIn: 0,
        available: 5,
      }),
    ).toBe("close");
    expect(
      categoryStatus({
        type: "Limit",
        budgeted: 100,
        spent: 130,
        carryIn: 0,
        available: -30,
      }),
    ).toBe("over");
    expect(
      categoryStatus({
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

  it("reallocationDonors lists rows with enough display-available", () => {
    const s = baseState();
    const rows = categoryRows(s, computeMonth(s, M), [], M);
    const donors = reallocationDonors(rows, "groceries", 40);
    expect(donors.map((d) => d.categoryId)).toContain("fun");
    expect(donors.map((d) => d.categoryId)).not.toContain("groceries");

    const tooBig = reallocationDonors(rows, "groceries", 9999);
    expect(tooBig).toHaveLength(0);
  });
});

describe("budget prefill", () => {
  function withPriorBudgets(): BudgetState {
    const s: BudgetState = {
      categories: [
        {
          id: "rent",
          name: "Rent",
          group: "Needs",
          archived: false,
          typeSegments: [{ fromMonth: PRIOR, type: "Limit" }],
        },
        {
          id: "fun",
          name: "Fun",
          group: "Wants",
          archived: false,
          typeSegments: [{ fromMonth: PRIOR, type: "Pot" }],
        },
      ],
      budgets: [
        { categoryId: "rent", month: PRIOR, amount: 700 },
        { categoryId: "rent", month: PREV, amount: 800 },
        { categoryId: "fun", month: PRIOR, amount: 50 },
      ],
      transactions: [],
      savingsAccounts: [],
      savingsEntries: [],
      income: [],
    };
    return s;
  }

  it("findPrefillBudget returns null when a record exists for the month", () => {
    const s = withPriorBudgets();
    expect(findPrefillBudget(s, "rent", PREV)).toBeNull();
  });

  it("findPrefillBudget returns the most recent prior amount when no record exists", () => {
    const s = withPriorBudgets();
    expect(findPrefillBudget(s, "rent", M)).toEqual({ amount: 800, sourceMonth: PREV });
    expect(findPrefillBudget(s, "fun", M)).toEqual({ amount: 50, sourceMonth: PRIOR });
  });

  it("findPrefillBudget returns 0 with no source when there is no prior history", () => {
    const s = withPriorBudgets();
    s.categories.push({
      id: "phone",
      name: "Phone",
      group: "Needs",
      archived: false,
      typeSegments: [{ fromMonth: PRIOR, type: "Limit" }],
    });
    expect(findPrefillBudget(s, "phone", M)).toEqual({ amount: 0, sourceMonth: null });
  });

  it("categoryRows shows the prefilled amount and source month", () => {
    const s = withPriorBudgets();
    const m = computeMonth(s, M);
    const rows = categoryRows(s, m, [], M);
    const rent = rows.find((r) => r.categoryId === "rent")!;
    expect(rent.budgeted).toBe(800);
    expect(rent.prefillSourceMonth).toBe(PREV);
    expect(rent.available).toBe(800);

    const fun = rows.find((r) => r.categoryId === "fun")!;
    expect(fun.budgeted).toBe(50);
    expect(fun.prefillSourceMonth).toBe(PRIOR);
  });

  it("prefilled rows do not flow into engine output (engine still sees raw records)", () => {
    const s = withPriorBudgets();
    const m = computeMonth(s, M);
    expect(m.totalBudgeted).toBe(0);
    expect(m.unallocated).toBe(0);
  });

  it("explicit zero record suppresses prefill", () => {
    const s = withPriorBudgets();
    s.budgets.push({ categoryId: "rent", month: M, amount: 0 });
    expect(findPrefillBudget(s, "rent", M)).toBeNull();
    const rows = categoryRows(s, computeMonth(s, M), [], M);
    const rent = rows.find((r) => r.categoryId === "rent")!;
    expect(rent.budgeted).toBe(0);
    expect(rent.prefillSourceMonth).toBeNull();
  });

  it("editing an earlier month does not rewrite a later month that has its own record", () => {
    const s = withPriorBudgets();
    s.budgets.find((b) => b.categoryId === "rent" && b.month === PRIOR)!.amount = 999;
    expect(findPrefillBudget(s, "rent", PREV)).toBeNull();
    const m = computeMonth(s, PREV);
    expect(m.totalBudgeted).toBe(800);
  });
});
