import { useMemo } from "react";
import type { BudgetState, IncomeEntry, Month, MonthlyBudget } from "../types.js";
import type { BudgetMove, BudgetReallocation, IncomeMovement, Movement } from "./state.js";
import { allReallocations } from "./state.js";
import { useAppStore } from "./store.js";
import { roundMoney } from "./utils/money.js";

export interface BudgetSource {
  baseline: MonthlyBudget[];
  reallocations: BudgetReallocation[];
}

export interface BudgetView {
  /** Untouched user-set budgets — used as the source of truth for prefill. */
  baselineBudgets: MonthlyBudget[];
  /** One-month adjustments applied on top of baseline, including category moves. */
  reallocations: BudgetReallocation[];
  /** Convenience source object for derived helpers like findPrefillBudget. */
  source: BudgetSource;
  /**
   * Effective BudgetState — baseline budgets merged with reallocations.
   * This is what the engine and most derived helpers consume.
   */
  effective: BudgetState;
}

export function mergeBudgets(
  baseline: MonthlyBudget[],
  reallocations: BudgetReallocation[],
): MonthlyBudget[] {
  if (reallocations.length === 0) return baseline;
  const map = new Map<string, MonthlyBudget>();
  for (const b of baseline) {
    map.set(`${b.categoryId}|${b.month}`, { ...b });
  }
  for (const r of reallocations) {
    const key = `${r.categoryId}|${r.month}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, amount: existing.amount + r.delta });
    } else {
      map.set(key, { categoryId: r.categoryId, month: r.month, amount: r.delta });
    }
  }
  return Array.from(map.values());
}

/** Logged income that counts toward each budget month, grouped by that month. */
export function linkedIncome(movements: Movement[]): Map<Month, IncomeMovement[]> {
  const map = new Map<Month, IncomeMovement[]>();
  for (const m of movements) {
    if (m.type !== "income" || !m.budgetMonth || !(m.amount > 0)) continue;
    const list = map.get(m.budgetMonth);
    if (list) list.push(m);
    else map.set(m.budgetMonth, [m]);
  }
  return map;
}

/**
 * Budget income per month. Where income has been logged for a month, the
 * month's income is exactly the sum of those entries; otherwise the manually
 * set figure stands. The manual figure is never overwritten, so deleting the
 * logged entries brings it back.
 */
export function mergeIncome(manual: IncomeEntry[], movements: Movement[]): IncomeEntry[] {
  const linked = linkedIncome(movements);
  if (linked.size === 0) return manual;
  const out = manual.filter((e) => !linked.has(e.month));
  for (const [month, list] of linked) {
    out.push({ month, netAmount: roundMoney(list.reduce((s, m) => s + m.amount, 0)) });
  }
  return out;
}

export function makeEffectiveBudget(
  baseline: BudgetState,
  reallocations: BudgetReallocation[],
  movements: Movement[] = [],
  moves: BudgetMove[] = [],
): BudgetState {
  return {
    ...baseline,
    budgets: mergeBudgets(baseline.budgets, allReallocations(reallocations, moves)),
    income: mergeIncome(baseline.income, movements),
  };
}

export function useBudgetView(): BudgetView {
  const baseline = useAppStore((s) => s.budget);
  const reallocations = useAppStore((s) => s.reallocations);
  const movements = useAppStore((s) => s.wealth.movements);
  const moves = useAppStore((s) => s.wealth.moves);
  return useMemo(() => {
    const all = allReallocations(reallocations, moves);
    const effective = makeEffectiveBudget(baseline, reallocations, movements, moves);
    return {
      baselineBudgets: baseline.budgets,
      reallocations: all,
      source: { baseline: baseline.budgets, reallocations: all },
      effective,
    };
  }, [baseline, reallocations, movements, moves]);
}
