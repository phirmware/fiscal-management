import { computeMonth } from "../engine.js";
import type {
  BudgetState,
  Category,
  CategoryMonthResult,
  Group,
  Month,
  MonthSummary,
} from "../types.js";
import type { OverspendAck } from "./state.js";
import { isAcked } from "./state.js";
import { nextMonth } from "./utils/month.js";

export type StatusBucket = "ok" | "close" | "over" | "empty";

export interface MonthBreakdown {
  income: number;
  /** Budget for Needs + Wants categories only. */
  spendingBudget: number;
  /** Sum of budgets for Savings-tagged categories. */
  savingsAllocated: number;
  /** Net savings activity this month: Σ (budgeted − spent) for Savings categories. */
  savingsThisMonth: number;
  /** Income minus the full budgeted total. Equals engine.unallocated. */
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

/**
 * UI-side view of a category for a month. `budgeted`/`available`/`status` are
 * "display" values: if no MonthlyBudget record exists for this month, they
 * reflect the prefill from the most recent prior month. The engine never sees
 * prefills — they live entirely in this layer.
 */
export interface CategoryRow {
  categoryId: string;
  name: string;
  group: Group;
  type: CategoryMonthResult["type"];
  spent: number;
  carryIn: number;
  budgeted: number;
  available: number;
  status: StatusBucket;
  acknowledged: boolean;
  prefillSourceMonth: Month | null;
}

export interface PrefillResult {
  amount: number;
  sourceMonth: Month | null;
}

export function notYetAssigned(monthSummary: MonthSummary): number {
  // Savings now lives in categories, so the budgeted total already accounts
  // for it — no extra subtraction needed beyond engine.unallocated.
  return monthSummary.unallocated;
}

export function savingsCategoryIds(state: BudgetState): Set<string> {
  const ids = new Set<string>();
  for (const c of state.categories) {
    if (c.group === "Savings") ids.add(c.id);
  }
  return ids;
}

/** Σ budgeted for Savings-tagged categories (planning intent). */
export function savingsAllocated(state: BudgetState, monthSummary: MonthSummary): number {
  const ids = savingsCategoryIds(state);
  let total = 0;
  for (const r of monthSummary.categories) {
    if (ids.has(r.categoryId)) total += r.budgeted;
  }
  return total;
}

/**
 * Per-category savings amount for the month: max(budgeted, spent).
 *
 * This covers both workflows users have:
 *  - Set a budget and don't log a transaction (budget is the savings amount).
 *  - Log a transaction as the deposit (no budget needed).
 *  - Do both — no double-counting.
 *
 * The downside is that a legitimate large withdrawal (spent ≫ budget) is
 * read as "deposited the larger amount", but that's an unusual case for
 * Savings categories and the Pot's `available` still tells the true story.
 */
export function savingsThisMonth(state: BudgetState, monthSummary: MonthSummary): number {
  const ids = savingsCategoryIds(state);
  let total = 0;
  for (const r of monthSummary.categories) {
    if (ids.has(r.categoryId)) total += Math.max(r.budgeted, r.spent);
  }
  return total;
}

function earliestRelevantMonth(state: BudgetState, ids: Set<string>): Month | null {
  let earliest: Month | null = null;
  const consider = (m: Month) => {
    if (!earliest || m < earliest) earliest = m;
  };
  for (const b of state.budgets) if (ids.has(b.categoryId)) consider(b.month);
  for (const t of state.transactions) if (ids.has(t.categoryId)) consider(t.date.slice(0, 7));
  for (const c of state.categories) {
    if (!ids.has(c.id)) continue;
    const first = c.typeSegments[0];
    if (first) consider(first.fromMonth);
  }
  return earliest;
}

/** Cumulative savings from inception through (and including) `throughMonth`. */
export function cumulativeSavings(state: BudgetState, throughMonth: Month): number {
  const ids = savingsCategoryIds(state);
  if (ids.size === 0) return 0;
  const earliest = earliestRelevantMonth(state, ids);
  if (!earliest || earliest > throughMonth) return 0;
  let total = 0;
  let m: Month = earliest;
  while (m <= throughMonth) {
    total += savingsThisMonth(state, computeMonth(state, m));
    if (m === throughMonth) break;
    m = nextMonth(m);
  }
  return total;
}

export function monthBreakdown(
  state: BudgetState,
  monthSummary: MonthSummary,
): MonthBreakdown {
  const allocated = savingsAllocated(state, monthSummary);
  const net = savingsThisMonth(state, monthSummary);
  return {
    income: monthSummary.income,
    spendingBudget: monthSummary.totalBudgeted - allocated,
    savingsAllocated: allocated,
    savingsThisMonth: net,
    notYetAssigned: notYetAssigned(monthSummary),
  };
}

export function categoryStatus(input: {
  budgeted: number;
  spent: number;
  carryIn: number;
  available: number;
  type: CategoryMonthResult["type"];
}): StatusBucket {
  if (input.budgeted === 0 && input.spent === 0 && input.carryIn === 0) return "empty";
  if (input.available < 0) return "over";
  const reference = input.type === "Pot" ? input.budgeted + input.carryIn : input.budgeted;
  if (reference <= 0) return input.available < 0 ? "over" : "ok";
  const usedFraction = (reference - input.available) / reference;
  if (usedFraction >= 0.9) return "close";
  return "ok";
}

/**
 * Returns the prefill that should drive the input for (categoryId, month).
 * - `null` ⇢ a MonthlyBudget record exists for this month; no prefill applies.
 * - `{ amount, sourceMonth: Month }` ⇢ no record, prefilled from a prior month.
 * - `{ amount: 0, sourceMonth: null }` ⇢ no record, no prior month found.
 */
export function findPrefillBudget(
  budget: BudgetState,
  categoryId: string,
  month: Month,
): PrefillResult | null {
  let best: { amount: number; month: Month } | null = null;
  let recordExists = false;

  for (const b of budget.budgets) {
    if (b.categoryId !== categoryId) continue;
    if (b.month === month) {
      recordExists = true;
      continue;
    }
    if (b.month > month) continue;
    if (!best || b.month > best.month) best = { amount: b.amount, month: b.month };
  }

  if (recordExists) return null;
  if (!best) return { amount: 0, sourceMonth: null };
  return { amount: best.amount, sourceMonth: best.month };
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

    const prefill = findPrefillBudget(state, r.categoryId, month);
    const displayBudgeted = prefill ? prefill.amount : r.budgeted;
    const displayAvailable =
      r.type === "Pot"
        ? r.carryIn + displayBudgeted - r.spent
        : displayBudgeted - r.spent;
    const status = categoryStatus({
      budgeted: displayBudgeted,
      spent: r.spent,
      carryIn: r.carryIn,
      available: displayAvailable,
      type: r.type,
    });

    rows.push({
      categoryId: r.categoryId,
      name: cat.name,
      group: cat.group,
      type: r.type,
      spent: r.spent,
      carryIn: r.carryIn,
      budgeted: displayBudgeted,
      available: displayAvailable,
      status,
      acknowledged: isAcked(acks, r.categoryId, month),
      prefillSourceMonth: prefill?.sourceMonth ?? null,
    });
  }
  return rows;
}

export function overspends(rows: CategoryRow[]): OverspendRow[] {
  const out: OverspendRow[] = [];
  for (const r of rows) {
    if (r.available >= 0) continue;
    out.push({
      categoryId: r.categoryId,
      name: r.name,
      amount: -r.available,
      acknowledged: r.acknowledged,
    });
  }
  return out;
}

export function unresolvedOverspends(rows: CategoryRow[]): OverspendRow[] {
  return overspends(rows).filter((r) => !r.acknowledged);
}

export function groupTotals(
  state: BudgetState,
  monthSummary: MonthSummary,
): GroupTotals {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);

  let needs = 0;
  let wants = 0;
  for (const r of monthSummary.categories) {
    const cat = byId.get(r.categoryId);
    if (!cat) continue;
    if (cat.group === "Needs") needs += r.spent;
    else if (cat.group === "Wants") wants += r.spent;
  }
  return {
    needs,
    wants,
    // Savings actual = net savings activity from Savings categories.
    savings: Math.max(0, savingsThisMonth(state, monthSummary)),
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
  rows: CategoryRow[],
  exceptCategoryId: string,
  minAvailable: number,
): DonorCandidate[] {
  const donors: DonorCandidate[] = [];
  for (const r of rows) {
    if (r.categoryId === exceptCategoryId) continue;
    if (r.available < minAvailable) continue;
    donors.push({
      categoryId: r.categoryId,
      name: r.name,
      group: r.group,
      available: r.available,
    });
  }
  donors.sort((a, b) => b.available - a.available);
  return donors;
}
