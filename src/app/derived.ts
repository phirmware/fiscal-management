import type {
  BudgetState,
  Category,
  CategoryMonthResult,
  Group,
  Month,
  MonthSummary,
  SavingsSummary,
} from "../types.js";
import type { OverspendAck } from "./state.js";
import { isAcked } from "./state.js";

export type StatusBucket = "ok" | "close" | "over" | "empty";

export interface MonthBreakdown {
  income: number;
  budgeted: number;
  savings: number;
  notYetAssigned: number;
}

export interface GroupTotals {
  needs: number;
  wants: number;
  savings: number;
}

export interface FiftyThirtyTwenty {
  needs: number;
  wants: number;
  savings: number;
}

export interface OverspendRow {
  categoryId: string;
  name: string;
  amount: number;
  acknowledged: boolean;
}

export interface CategoryRow extends CategoryMonthResult {
  name: string;
  group: Group;
  status: StatusBucket;
  acknowledged: boolean;
}

export function notYetAssigned(
  monthSummary: MonthSummary,
  savingsSummary: SavingsSummary,
): number {
  return monthSummary.unallocated - savingsSummary.monthTotal;
}

export function monthBreakdown(
  monthSummary: MonthSummary,
  savingsSummary: SavingsSummary,
): MonthBreakdown {
  return {
    income: monthSummary.income,
    budgeted: monthSummary.totalBudgeted,
    savings: savingsSummary.monthTotal,
    notYetAssigned: notYetAssigned(monthSummary, savingsSummary),
  };
}

export function categoryStatus(row: CategoryMonthResult): StatusBucket {
  if (row.budgeted === 0 && row.spent === 0 && row.carryIn === 0) return "empty";
  if (row.available < 0) return "over";
  const reference = row.type === "Pot" ? row.budgeted + row.carryIn : row.budgeted;
  if (reference <= 0) return row.available < 0 ? "over" : "ok";
  const usedFraction = (reference - row.available) / reference;
  if (usedFraction >= 0.9) return "close";
  return "ok";
}

export function categoryRows(
  state: BudgetState,
  monthSummary: MonthSummary,
  acks: OverspendAck[],
  month: Month,
): CategoryRow[] {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);

  const rows: CategoryRow[] = [];
  for (const r of monthSummary.categories) {
    const cat = byId.get(r.categoryId);
    if (!cat) continue;
    rows.push({
      ...r,
      name: cat.name,
      group: cat.group,
      status: categoryStatus(r),
      acknowledged: isAcked(acks, r.categoryId, month),
    });
  }
  return rows;
}

export function overspends(
  state: BudgetState,
  monthSummary: MonthSummary,
  acks: OverspendAck[],
  month: Month,
): OverspendRow[] {
  const rows = categoryRows(state, monthSummary, acks, month);
  return rows
    .filter((r) => r.available < 0)
    .map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      amount: -r.available,
      acknowledged: r.acknowledged,
    }));
}

export function unresolvedOverspends(
  state: BudgetState,
  monthSummary: MonthSummary,
  acks: OverspendAck[],
  month: Month,
): OverspendRow[] {
  return overspends(state, monthSummary, acks, month).filter((r) => !r.acknowledged);
}

export function groupTotals(
  state: BudgetState,
  monthSummary: MonthSummary,
  savingsSummary: SavingsSummary,
): GroupTotals {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);

  let needs = 0;
  let wants = 0;
  let savingsFromCategories = 0;
  for (const r of monthSummary.categories) {
    const cat = byId.get(r.categoryId);
    if (!cat) continue;
    if (cat.group === "Needs") needs += r.spent;
    else if (cat.group === "Wants") wants += r.spent;
    else savingsFromCategories += r.spent;
  }
  return {
    needs,
    wants,
    savings: savingsFromCategories + savingsSummary.monthTotal,
  };
}

export function fiftyThirtyTwentyBenchmark(income: number): FiftyThirtyTwenty {
  return {
    needs: income * 0.5,
    wants: income * 0.3,
    savings: income * 0.2,
  };
}

export interface DonorCandidate {
  categoryId: string;
  name: string;
  group: Group;
  available: number;
}

export function reallocationDonors(
  state: BudgetState,
  monthSummary: MonthSummary,
  exceptCategoryId: string,
  minAvailable: number,
): DonorCandidate[] {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);

  const donors: DonorCandidate[] = [];
  for (const r of monthSummary.categories) {
    if (r.categoryId === exceptCategoryId) continue;
    if (r.available < minAvailable) continue;
    const cat = byId.get(r.categoryId);
    if (!cat) continue;
    donors.push({
      categoryId: r.categoryId,
      name: cat.name,
      group: cat.group,
      available: r.available,
    });
  }
  donors.sort((a, b) => b.available - a.available);
  return donors;
}
