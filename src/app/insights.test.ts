import { describe, expect, it } from "vitest";
import { computeMonth } from "../engine.js";
import type { BudgetState } from "../types.js";
import { buildFlow, rangeSummary, releasesFor, savingsTrend, unresolvedReleases } from "./insights.js";
import type { ReleaseAck } from "./state.js";

function makeBudget(): BudgetState {
  return {
    categories: [
      {
        id: "rent",
        name: "Rent",
        group: "Needs",
        archived: false,
        typeSegments: [{ fromMonth: "2026-01", type: "Limit" }],
      },
      {
        id: "fun",
        name: "Fun",
        group: "Wants",
        archived: false,
        typeSegments: [{ fromMonth: "2026-01", type: "Limit" }],
      },
      {
        id: "eatout",
        name: "Eating out",
        group: "Wants",
        archived: false,
        typeSegments: [
          { fromMonth: "2026-01", type: "Pot" },
          { fromMonth: "2026-03", type: "Limit" },
        ],
      },
      {
        id: "emerg",
        name: "Emergency",
        group: "Savings",
        archived: false,
        typeSegments: [{ fromMonth: "2026-01", type: "Pot" }],
      },
    ],
    budgets: [
      { categoryId: "rent", month: "2026-01", amount: 800 },
      { categoryId: "rent", month: "2026-02", amount: 800 },
      { categoryId: "rent", month: "2026-03", amount: 800 },
      { categoryId: "fun", month: "2026-01", amount: 100 },
      { categoryId: "fun", month: "2026-02", amount: 100 },
      { categoryId: "fun", month: "2026-03", amount: 100 },
      { categoryId: "eatout", month: "2026-01", amount: 100 },
      { categoryId: "eatout", month: "2026-02", amount: 100 },
      { categoryId: "eatout", month: "2026-03", amount: 50 },
      { categoryId: "emerg", month: "2026-01", amount: 100 },
      { categoryId: "emerg", month: "2026-02", amount: 200 },
      { categoryId: "emerg", month: "2026-03", amount: 0 },
    ],
    transactions: [
      { id: "r1", categoryId: "rent", date: "2026-01-01", amount: 800 },
      { id: "r2", categoryId: "rent", date: "2026-02-01", amount: 800 },
      { id: "r3", categoryId: "rent", date: "2026-03-01", amount: 800 },
      { id: "f1", categoryId: "fun", date: "2026-01-12", amount: 40 },
      { id: "e1", categoryId: "eatout", date: "2026-01-10", amount: 30 },
      { id: "e2", categoryId: "eatout", date: "2026-02-10", amount: 50 },
      { id: "ew1", categoryId: "emerg", date: "2026-03-15", amount: 50 },
    ],
    savingsAccounts: [],
    savingsEntries: [],
    income: [
      { month: "2026-01", netAmount: 2000 },
      { month: "2026-02", netAmount: 2000 },
      { month: "2026-03", netAmount: 2000 },
    ],
  };
}

describe("insights helpers", () => {
  it("savingsTrend counts max(budgeted, spent) per Savings category each month", () => {
    const b = makeBudget();
    const trend = savingsTrend(b, "2026-01", "2026-03");
    expect(trend).toHaveLength(3);
    expect(trend.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    // emerg: M1 budget 100 / spent 0 → 100; M2 budget 200 / spent 0 → 200;
    //        M3 budget 0 / spent 50 (transaction) → 50.
    expect(trend[0]!.monthTotal).toBe(100);
    expect(trend[1]!.monthTotal).toBe(200);
    expect(trend[2]!.monthTotal).toBe(50);
    expect(trend[0]!.cumulativeTotal).toBe(100);
    expect(trend[1]!.cumulativeTotal).toBe(300);
    expect(trend[2]!.cumulativeTotal).toBe(350);
  });

  it("buildFlow: Needs/Wants by spent, Savings by net (budgeted − spent), unassigned closes", () => {
    const b = makeBudget();
    const m = computeMonth(b, "2026-01");
    const flow = buildFlow(b, m);

    const groupTotal = (g: string) => flow.nodes.find((n) => n.id === `group:${g}`)?.amount ?? 0;
    expect(groupTotal("Needs")).toBe(800); // rent spent
    expect(groupTotal("Wants")).toBe(70); // fun 40 + eatout 30
    expect(groupTotal("Savings")).toBe(100); // emerg net

    const unassigned = flow.nodes.find((n) => n.id === "unassigned")?.amount ?? 0;
    expect(unassigned).toBe(2000 - (800 + 70 + 100));

    const col2 = flow.nodes.filter((n) => n.column === 2).map((n) => n.label);
    expect(col2).toContain("Rent");
    expect(col2).toContain("Fun");
    expect(col2).toContain("Eating out");
    expect(col2).toContain("Emergency"); // savings category appears like any other
  });

  it("releasesFor surfaces the Pot→Limit released amount with category info", () => {
    const b = makeBudget();
    // Eating out: M1 budget 100, spent 30 → available 70 going into M2
    //             M2 budget 100, spent 50 → available 70 + 100 - 50 = 120 at end of M2
    // At M3 the Pot converts to Limit → released = 120
    const r = releasesFor(b, "2026-03", []);
    expect(r).toHaveLength(1);
    expect(r[0]!.categoryId).toBe("eatout");
    expect(r[0]!.categoryName).toBe("Eating out");
    expect(r[0]!.amount).toBe(120);
    expect(r[0]!.acknowledged).toBe(false);
  });

  it("acknowledged releases are filtered out of unresolvedReleases", () => {
    const b = makeBudget();
    const acks: ReleaseAck[] = [{ categoryId: "eatout", month: "2026-03" }];
    const all = releasesFor(b, "2026-03", acks);
    expect(all[0]!.acknowledged).toBe(true);
    expect(unresolvedReleases(b, "2026-03", acks)).toHaveLength(0);
  });

  it("rangeSummary aggregates correctly across months", () => {
    const b = makeBudget();
    const r = rangeSummary(b, "2026-01", "2026-03");
    expect(r.monthCount).toBe(3);
    expect(r.totalIncome).toBe(6000);
    // rent 2400 + fun 300 + eatout 250 + emerg 300 = 3250
    expect(r.totalBudgeted).toBe(2400 + 300 + 250 + 300);
    // rent 2400 + fun 40 + eatout 80 + emerg withdrawal 50 = 2570
    expect(r.totalSpent).toBe(2400 + 40 + 80 + 50);
    // savingsThisMonth (max(budgeted, spent)) per month: 100 + 200 + 50 = 350
    expect(r.totalSaved).toBe(350);
  });
});
