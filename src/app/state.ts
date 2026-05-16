import type { BudgetState, Month } from "../types.js";

export interface OverspendAck {
  categoryId: string;
  month: Month;
}

export interface UiState {
  selectedMonth: Month;
  lastUsedCategoryId: string | null;
}

export interface AppState {
  version: number;
  budget: BudgetState;
  overspendAcks: OverspendAck[];
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
    ui: {
      selectedMonth: currentMonth(now),
      lastUsedCategoryId: null,
    },
  };
}

export function isAcked(acks: OverspendAck[], categoryId: string, month: Month): boolean {
  for (const a of acks) {
    if (a.categoryId === categoryId && a.month === month) return true;
  }
  return false;
}
