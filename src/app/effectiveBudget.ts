import { useMemo } from "react";
import type { BudgetState, MonthlyBudget } from "../types.js";
import type { BudgetReallocation } from "./state.js";
import { useAppStore } from "./store.js";

export interface BudgetSource {
  baseline: MonthlyBudget[];
  reallocations: BudgetReallocation[];
}

export interface BudgetView {
  /** Untouched user-set budgets — used as the source of truth for prefill. */
  baselineBudgets: MonthlyBudget[];
  /** One-month adjustments applied on top of baseline. */
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

export function makeEffectiveBudget(
  baseline: BudgetState,
  reallocations: BudgetReallocation[],
): BudgetState {
  return { ...baseline, budgets: mergeBudgets(baseline.budgets, reallocations) };
}

export function useBudgetView(): BudgetView {
  const baseline = useAppStore((s) => s.budget);
  const reallocations = useAppStore((s) => s.reallocations);
  return useMemo(() => {
    const effective = makeEffectiveBudget(baseline, reallocations);
    return {
      baselineBudgets: baseline.budgets,
      reallocations,
      source: { baseline: baseline.budgets, reallocations },
      effective,
    };
  }, [baseline, reallocations]);
}
