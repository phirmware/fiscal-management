import { describe, expect, it } from "vitest";
import type { BudgetState } from "../types.js";
import type { WealthAccount, WealthState } from "./state.js";
import {
  accountViews,
  cashFlowSeries,
  healthReport,
  monthEnd,
  netWorthAt,
  netWorthSeries,
  projectPayoff,
  retirementMultipleForAge,
  trailingAverages,
} from "./wealth.js";

function acc(id: string, kind: WealthAccount["kind"], extra: Partial<WealthAccount> = {}): WealthAccount {
  return { id, name: id, kind, archived: false, createdAt: "2026-01-01", ...extra };
}

function wealth(partial: Partial<WealthState> = {}): WealthState {
  return { accounts: [], snapshots: [], profile: { emergencyMonthsTarget: 6 }, ...partial };
}

function budgetWith(months: { month: string; income: number; needs: number; wants: number }[]): BudgetState {
  const state: BudgetState = {
    categories: [
      { id: "rent", name: "Rent", group: "Needs", typeSegments: [{ fromMonth: "2020-01", type: "Limit" }], archived: false },
      { id: "fun", name: "Fun", group: "Wants", typeSegments: [{ fromMonth: "2020-01", type: "Limit" }], archived: false },
    ],
    budgets: [],
    transactions: [],
    savingsAccounts: [],
    savingsEntries: [],
    income: [],
  };
  for (const m of months) {
    state.income.push({ month: m.month, netAmount: m.income });
    state.transactions.push({ id: `${m.month}-n`, categoryId: "rent", date: `${m.month}-05`, amount: m.needs });
    state.transactions.push({ id: `${m.month}-w`, categoryId: "fun", date: `${m.month}-10`, amount: m.wants });
  }
  return state;
}

describe("monthEnd", () => {
  it("handles month lengths and leap years", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });
});

describe("netWorthAt", () => {
  const w = wealth({
    accounts: [acc("cur", "current"), acc("pen", "pension"), acc("cc", "creditCard")],
    snapshots: [
      { id: "1", accountId: "cur", date: "2026-01-10", balance: 1000 },
      { id: "2", accountId: "cur", date: "2026-03-01", balance: 1500 },
      { id: "3", accountId: "pen", date: "2026-02-15", balance: 20000 },
      { id: "4", accountId: "cc", date: "2026-01-20", balance: 400 },
    ],
  });

  it("carries the latest balance forward and subtracts liabilities", () => {
    const p = netWorthAt(w, "2026-02-28");
    expect(p.byClass.cash).toBe(1000);
    expect(p.byClass.pension).toBe(20000);
    expect(p.liabilities).toBe(400);
    expect(p.netWorth).toBe(20600);
  });

  it("ignores snapshots after the date", () => {
    expect(netWorthAt(w, "2026-01-15").netWorth).toBe(1000);
  });

  it("marks months before the first snapshot as having no data", () => {
    const s = netWorthSeries(w, "2025-12", "2026-03");
    expect(s.map((p) => p.hasData)).toEqual([false, true, true, true]);
    expect(s[3]!.netWorth).toBe(21100);
  });
});

describe("accountViews", () => {
  it("separates growth from contributions", () => {
    const w = wealth({
      accounts: [acc("isa", "investment")],
      snapshots: [
        { id: "1", accountId: "isa", date: "2026-01-01", balance: 10000 },
        { id: "2", accountId: "isa", date: "2026-02-01", balance: 11200, contribution: 500 },
      ],
    });
    const [v] = accountViews(w, "2026-02-28", "2026-03-10");
    expect(v!.contributed).toBe(500);
    expect(v!.growth).toBe(700);
    expect(v!.change).toBe(1200);
    expect(v!.daysSinceUpdate).toBe(37);
  });
});

describe("cash flow", () => {
  const b = budgetWith([
    { month: "2026-01", income: 3000, needs: 1500, wants: 600 },
    { month: "2026-02", income: 3000, needs: 1500, wants: 900 },
    { month: "2026-03", income: 3000, needs: 1500, wants: 300 },
    { month: "2026-04", income: 3000, needs: 200, wants: 50 },
  ]);

  it("computes net and savings rate per month", () => {
    const [jan] = cashFlowSeries(b, "2026-01", "2026-01");
    expect(jan!.spending).toBe(2100);
    expect(jan!.net).toBe(900);
    expect(jan!.savingsRate).toBeCloseTo(0.3);
  });

  it("averages the months before the selected (partial) month", () => {
    const avg = trailingAverages(b, "2026-04");
    expect(avg.months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(avg.spending).toBe(2100);
    expect(avg.needs).toBe(1500);
  });
});

describe("projectPayoff", () => {
  it("returns null months when the payment doesn't cover interest", () => {
    expect(projectPayoff(5000, 24, 90).months).toBeNull();
  });

  it("projects a finite payoff", () => {
    const p = projectPayoff(1200, 0, 100);
    expect(p.months).toBe(12);
    expect(p.totalInterest).toBe(0);
    const q = projectPayoff(3000, 20, 150);
    expect(q.months).toBeGreaterThan(20);
    expect(q.months).toBeLessThan(30);
    expect(q.totalInterest).toBeGreaterThan(0);
  });
});

describe("retirementMultipleForAge", () => {
  it("interpolates between anchors", () => {
    expect(retirementMultipleForAge(30)).toBe(1);
    expect(retirementMultipleForAge(32.5)).toBeCloseTo(1.5);
    expect(retirementMultipleForAge(80)).toBe(10);
  });
});

describe("healthReport", () => {
  const budget = budgetWith([
    { month: "2026-07", income: 3000, needs: 1500, wants: 1700 },
    { month: "2026-08", income: 3000, needs: 1500, wants: 1700 },
    { month: "2026-09", income: 3000, needs: 1500, wants: 1700 },
  ]);

  it("flags overspending, thin emergency fund and expensive debt", () => {
    const w = wealth({
      accounts: [
        acc("cur", "current"),
        acc("cc", "creditCard", { rate: 24.9, creditLimit: 3000, monthlyPayment: 100 }),
      ],
      snapshots: [
        { id: "1", accountId: "cur", date: "2026-10-01", balance: 800 },
        { id: "2", accountId: "cc", date: "2026-10-01", balance: 2400 },
      ],
    });
    const r = healthReport({ wealth: w, budget, month: "2026-10", today: "2026-10-20" });
    const ids = r.flags.map((f) => f.id);
    expect(ids).toContain("spending-exceeds-income");
    expect(ids).toContain("emergency-low");
    expect(ids).toContain("utilisation-high");
    expect(ids).toContain("high-interest-debt");
    expect(r.flags[0]!.severity).toBe("critical");
    expect(r.metrics.find((m) => m.id === "savings-rate")!.status).toBe("bad");
    expect(r.metrics.find((m) => m.id === "utilisation")!.value).toBe("80%");
  });

  it("flags a debt whose payment never clears the balance", () => {
    const w = wealth({
      accounts: [acc("loan", "loan", { rate: 30, monthlyPayment: 50 })],
      snapshots: [{ id: "1", accountId: "loan", date: "2026-10-01", balance: 5000 }],
    });
    const r = healthReport({ wealth: w, budget, month: "2026-10", today: "2026-10-20" });
    expect(r.flags.some((f) => f.id === "never-clears-loan")).toBe(true);
  });

  it("uses flagged emergency-fund accounts when present", () => {
    const w = wealth({
      accounts: [acc("cur", "current"), acc("ef", "savings", { emergencyFund: true })],
      snapshots: [
        { id: "1", accountId: "cur", date: "2026-10-01", balance: 50000 },
        { id: "2", accountId: "ef", date: "2026-10-01", balance: 4500 },
      ],
    });
    const r = healthReport({ wealth: w, budget, month: "2026-10", today: "2026-10-20" });
    expect(r.emergencyFund).toBe(4500);
    expect(r.metrics.find((m) => m.id === "emergency")!.value).toBe("3.0 mo");
  });

  it("only nags about stale balances when viewing the present", () => {
    const w = wealth({
      accounts: [acc("cur", "current")],
      snapshots: [{ id: "1", accountId: "cur", date: "2026-06-01", balance: 2000 }],
    });
    const now = healthReport({ wealth: w, budget, month: "2026-10", today: "2026-10-20" });
    expect(now.flags.some((f) => f.id === "stale")).toBe(true);
    const past = healthReport({ wealth: w, budget, month: "2026-07", today: "2026-10-20" });
    expect(past.flags.some((f) => f.id === "stale")).toBe(false);
  });

  it("celebrates a healthy savings rate", () => {
    const good = budgetWith([
      { month: "2026-08", income: 4000, needs: 1600, wants: 800 },
      { month: "2026-09", income: 4000, needs: 1600, wants: 800 },
    ]);
    const r = healthReport({ wealth: wealth(), budget: good, month: "2026-10", today: "2026-10-20" });
    expect(r.flags.some((f) => f.id === "savings-rate-win")).toBe(true);
  });
});
