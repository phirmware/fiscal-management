import { describe, expect, it } from "vitest";
import {
  computeCategoryMonth,
  computeMonth,
  computeSavings,
  resolveType,
} from "./engine.js";
import type {
  BudgetState,
  Category,
  IncomeEntry,
  MonthlyBudget,
  SavingsAccount,
  SavingsEntry,
  Transaction,
} from "./types.js";

const M1 = "2026-01";
const M2 = "2026-02";
const M3 = "2026-03";
const M4 = "2026-04";

function makeState(parts: Partial<BudgetState> = {}): BudgetState {
  return {
    categories: parts.categories ?? [],
    budgets: parts.budgets ?? [],
    transactions: parts.transactions ?? [],
    savingsAccounts: parts.savingsAccounts ?? [],
    savingsEntries: parts.savingsEntries ?? [],
    income: parts.income ?? [],
  };
}

function pot(id: string, fromMonth = M1, name = id): Category {
  return {
    id,
    name,
    group: "Wants",
    typeSegments: [{ fromMonth, type: "Pot" }],
    archived: false,
  };
}

function limit(id: string, fromMonth = M1, name = id): Category {
  return {
    id,
    name,
    group: "Wants",
    typeSegments: [{ fromMonth, type: "Limit" }],
    archived: false,
  };
}

function budget(categoryId: string, month: string, amount: number): MonthlyBudget {
  return { categoryId, month, amount };
}

function txn(
  id: string,
  categoryId: string,
  date: string,
  amount: number,
): Transaction {
  return { id, categoryId, date, amount };
}

function income(month: string, netAmount: number): IncomeEntry {
  return { month, netAmount };
}

function savingsAccount(id: string, startingBalance = 0, name = id): SavingsAccount {
  return { id, name, startingBalance };
}

function savingsEntry(accountId: string, month: string, amount: number): SavingsEntry {
  return { accountId, month, amount };
}

describe("resolveType", () => {
  it("returns the type of the latest applicable segment", () => {
    const cat: Category = {
      id: "c",
      name: "c",
      group: "Wants",
      archived: false,
      typeSegments: [
        { fromMonth: M1, type: "Pot" },
        { fromMonth: M3, type: "Limit" },
      ],
    };
    expect(resolveType(cat, M1)).toBe("Pot");
    expect(resolveType(cat, M2)).toBe("Pot");
    expect(resolveType(cat, M3)).toBe("Limit");
    expect(resolveType(cat, M4)).toBe("Limit");
  });
});

describe("carry-forward rules", () => {
  it("1. First month: any category has carryIn === 0", () => {
    const state = makeState({
      categories: [pot("p"), limit("l")],
      budgets: [budget("p", M1, 100), budget("l", M1, 50)],
      transactions: [txn("t1", "p", "2026-01-10", 20)],
    });
    const p = computeCategoryMonth(state, "p", M1);
    const l = computeCategoryMonth(state, "l", M1);
    expect(p.carryIn).toBe(0);
    expect(l.carryIn).toBe(0);
  });

  it("2. Pot surplus carries forward (budgeted vs available stay distinct)", () => {
    const state = makeState({
      categories: [pot("p")],
      budgets: [budget("p", M1, 100), budget("p", M2, 100)],
      transactions: [txn("t1", "p", "2026-01-15", 50)],
    });
    const m1 = computeCategoryMonth(state, "p", M1);
    const m2 = computeCategoryMonth(state, "p", M2);
    expect(m1.available).toBe(50);
    expect(m2.budgeted).toBe(100);
    expect(m2.carryIn).toBe(50);
    expect(m2.available).toBe(150);
  });

  it("3. Pot deficit carries forward (negative available, then reduced next month)", () => {
    const state = makeState({
      categories: [pot("p")],
      budgets: [budget("p", M1, 100), budget("p", M2, 100)],
      transactions: [txn("t1", "p", "2026-01-15", 120)],
    });
    const m1 = computeCategoryMonth(state, "p", M1);
    const m2 = computeCategoryMonth(state, "p", M2);
    expect(m1.available).toBe(-20);
    expect(m2.carryIn).toBe(-20);
    expect(m2.available).toBe(80);
  });

  it("4. Pot chain over 3+ months accumulates surplus and deficit correctly", () => {
    const state = makeState({
      categories: [pot("p")],
      budgets: [
        budget("p", M1, 100),
        budget("p", M2, 100),
        budget("p", M3, 100),
        budget("p", M4, 100),
      ],
      transactions: [
        txn("t1", "p", "2026-01-10", 60),
        txn("t2", "p", "2026-02-10", 150),
        txn("t3", "p", "2026-03-10", 80),
      ],
    });
    const m1 = computeCategoryMonth(state, "p", M1);
    const m2 = computeCategoryMonth(state, "p", M2);
    const m3 = computeCategoryMonth(state, "p", M3);
    const m4 = computeCategoryMonth(state, "p", M4);
    expect(m1.available).toBe(40);
    expect(m2.carryIn).toBe(40);
    expect(m2.available).toBe(-10);
    expect(m3.carryIn).toBe(-10);
    expect(m3.available).toBe(10);
    expect(m4.carryIn).toBe(10);
    expect(m4.available).toBe(110);
  });

  it("5. Limit resets each month (surplus does not carry)", () => {
    const state = makeState({
      categories: [limit("l")],
      budgets: [budget("l", M1, 100), budget("l", M2, 100)],
      transactions: [txn("t1", "l", "2026-01-10", 40)],
    });
    const m1 = computeCategoryMonth(state, "l", M1);
    const m2 = computeCategoryMonth(state, "l", M2);
    expect(m1.available).toBe(60);
    expect(m2.carryIn).toBe(0);
    expect(m2.available).toBe(100);
  });

  it("6. Limit overspend does not carry — next month available equals budgeted", () => {
    const state = makeState({
      categories: [limit("l")],
      budgets: [budget("l", M1, 100), budget("l", M2, 100)],
      transactions: [txn("t1", "l", "2026-01-10", 130)],
    });
    const m1 = computeCategoryMonth(state, "l", M1);
    const m2 = computeCategoryMonth(state, "l", M2);
    expect(m1.available).toBe(-30);
    expect(m2.carryIn).toBe(0);
    expect(m2.available).toBe(100);
  });

  it("7. Pot → Limit conversion releases the prior Pot balance, M2 carryIn is 0", () => {
    const cat: Category = {
      id: "c",
      name: "c",
      group: "Wants",
      archived: false,
      typeSegments: [
        { fromMonth: M1, type: "Pot" },
        { fromMonth: M2, type: "Limit" },
      ],
    };
    const state = makeState({
      categories: [cat],
      budgets: [budget("c", M1, 100), budget("c", M2, 50)],
      transactions: [
        txn("t1", "c", "2026-01-10", 30),
        txn("t2", "c", "2026-02-10", 20),
      ],
    });
    const m1 = computeCategoryMonth(state, "c", M1);
    expect(m1.type).toBe("Pot");
    expect(m1.available).toBe(70);

    const m2 = computeCategoryMonth(state, "c", M2);
    expect(m2.type).toBe("Limit");
    expect(m2.carryIn).toBe(0);
    expect(m2.available).toBe(30);

    const monthSummary = computeMonth(state, M2);
    expect(monthSummary.releasedFromConversions).toBe(70);
  });

  it("8. Limit → Pot conversion: M2 carryIn === 0, M3 carries M2's available", () => {
    const cat: Category = {
      id: "c",
      name: "c",
      group: "Wants",
      archived: false,
      typeSegments: [
        { fromMonth: M1, type: "Limit" },
        { fromMonth: M2, type: "Pot" },
      ],
    };
    const state = makeState({
      categories: [cat],
      budgets: [budget("c", M1, 100), budget("c", M2, 100), budget("c", M3, 100)],
      transactions: [
        txn("t1", "c", "2026-01-10", 80),
        txn("t2", "c", "2026-02-10", 25),
      ],
    });
    const m2 = computeCategoryMonth(state, "c", M2);
    expect(m2.type).toBe("Pot");
    expect(m2.carryIn).toBe(0);
    expect(m2.available).toBe(75);

    const m3 = computeCategoryMonth(state, "c", M3);
    expect(m3.carryIn).toBe(75);
    expect(m3.available).toBe(175);
  });

  it("9. Editing an M1 transaction implicitly changes M2 (no stored totals)", () => {
    const baseState = makeState({
      categories: [pot("p")],
      budgets: [budget("p", M1, 100), budget("p", M2, 100)],
      transactions: [txn("t1", "p", "2026-01-15", 50)],
    });
    const before = computeCategoryMonth(baseState, "p", M2);
    expect(before.carryIn).toBe(50);
    expect(before.available).toBe(150);

    const editedState: BudgetState = {
      ...baseState,
      transactions: [txn("t1", "p", "2026-01-15", 90)],
    };
    const after = computeCategoryMonth(editedState, "p", M2);
    expect(after.carryIn).toBe(10);
    expect(after.available).toBe(110);
  });

  it("10. Unallocated correct when income is set and when unset (no throw)", () => {
    const stateWithIncome = makeState({
      categories: [pot("p")],
      budgets: [budget("p", M1, 300)],
      income: [income(M1, 1000)],
    });
    const withIncome = computeMonth(stateWithIncome, M1);
    expect(withIncome.income).toBe(1000);
    expect(withIncome.incomeSet).toBe(true);
    expect(withIncome.totalBudgeted).toBe(300);
    expect(withIncome.unallocated).toBe(700);

    const stateNoIncome = makeState({
      categories: [pot("p")],
      budgets: [budget("p", M1, 300)],
    });
    const noIncome = computeMonth(stateNoIncome, M1);
    expect(noIncome.income).toBe(0);
    expect(noIncome.incomeSet).toBe(false);
    expect(noIncome.unallocated).toBe(-300);
  });

  it("rounds floating-point drift out of unallocated totals", () => {
    const state = makeState({
      categories: [limit("a"), limit("b")],
      budgets: [budget("a", M1, 0.1), budget("b", M1, 0.2)],
      income: [income(M1, 0.3)],
    });

    const month = computeMonth(state, M1);
    expect(month.totalBudgeted).toBe(0.3);
    expect(month.unallocated).toBe(0);
    expect(Object.is(month.unallocated, -0)).toBe(false);
  });

  it("11. Savings monthly total and cumulative (including a negative withdrawal)", () => {
    const state = makeState({
      savingsAccounts: [savingsAccount("emergency", 500), savingsAccount("travel", 0)],
      savingsEntries: [
        savingsEntry("emergency", M1, 200),
        savingsEntry("travel", M1, 100),
        savingsEntry("emergency", M2, 150),
        savingsEntry("travel", M2, -50),
      ],
    });
    const m1 = computeSavings(state, M1);
    expect(m1.monthTotal).toBe(300);
    expect(m1.cumulativeByAccount["emergency"]).toBe(700);
    expect(m1.cumulativeByAccount["travel"]).toBe(100);
    expect(m1.cumulativeTotal).toBe(800);

    const m2 = computeSavings(state, M2);
    expect(m2.monthTotal).toBe(100);
    expect(m2.cumulativeByAccount["emergency"]).toBe(850);
    expect(m2.cumulativeByAccount["travel"]).toBe(50);
    expect(m2.cumulativeTotal).toBe(900);
  });
});
