import type { AppState } from "./state.js";
import { APP_STATE_VERSION, emptyAppState } from "./state.js";

const STORAGE_KEY = "budget.appstate.v1";

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAppState();
    const parsed = JSON.parse(raw);
    return normaliseAppState(parsed);
  } catch {
    return emptyAppState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silent fail keeps the UI usable.
  }
}

export function resetAppState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportAppStateJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importAppStateJson(json: string): AppState {
  const parsed = JSON.parse(json);
  return normaliseAppState(parsed);
}

export function normaliseAppState(input: unknown): AppState {
  const base = emptyAppState();
  if (!input || typeof input !== "object") return base;
  const src = input as Partial<AppState>;
  const budget = (src.budget ?? base.budget) as AppState["budget"];
  return {
    version: APP_STATE_VERSION,
    budget: {
      categories: budget.categories ?? [],
      budgets: budget.budgets ?? [],
      transactions: budget.transactions ?? [],
      savingsAccounts: budget.savingsAccounts ?? [],
      savingsEntries: budget.savingsEntries ?? [],
      income: budget.income ?? [],
    },
    overspendAcks: src.overspendAcks ?? [],
    releaseAcks: src.releaseAcks ?? [],
    ui: {
      selectedMonth: src.ui?.selectedMonth ?? base.ui.selectedMonth,
      lastUsedCategoryId: src.ui?.lastUsedCategoryId ?? null,
      hasOnboarded: src.ui?.hasOnboarded ?? false,
      theme: src.ui?.theme ?? "system",
    },
  };
}
