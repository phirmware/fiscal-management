import type { BudgetState, Month } from "../types.js";

export interface OverspendAck {
  categoryId: string;
  month: Month;
}

export interface ReleaseAck {
  categoryId: string;
  month: Month;
}

/**
 * A one-month adjustment to a category's effective budget. Lives outside the
 * engine's BudgetState so the baseline MonthlyBudget records (which drive the
 * next-month prefill) stay unchanged. Multiple reallocations for the same
 * (categoryId, month) are additive — they sum.
 */
export interface BudgetReallocation {
  categoryId: string;
  month: Month;
  delta: number;
}

export type ThemePreference = "light" | "dark" | "liquid" | "system";

export interface UiState {
  selectedMonth: Month;
  lastUsedCategoryId: string | null;
  hasOnboarded: boolean;
  theme: ThemePreference;
}

export interface AppState {
  version: number;
  budget: BudgetState;
  overspendAcks: OverspendAck[];
  releaseAcks: ReleaseAck[];
  reallocations: BudgetReallocation[];
  ui: UiState;
}

export const APP_STATE_VERSION = 1;

export function currentMonth(now: Date = new Date()): Month {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${m < 10 ? `0${m}` : m}`;
}

export function emptyAppState(now: Date = new Date()): AppState {
  return {
    version: APP_STATE_VERSION,
    budget: {
      categories: [],
      budgets: [],
      transactions: [],
      savingsAccounts: [],
      savingsEntries: [],
      income: [],
    },
    overspendAcks: [],
    releaseAcks: [],
    reallocations: [],
    ui: {
      selectedMonth: currentMonth(now),
      lastUsedCategoryId: null,
      hasOnboarded: false,
      theme: "system",
    },
  };
}

export function isAcked(
  acks: { categoryId: string; month: Month }[],
  categoryId: string,
  month: Month,
): boolean {
  for (const a of acks) {
    if (a.categoryId === categoryId && a.month === month) return true;
  }
  return false;
}
