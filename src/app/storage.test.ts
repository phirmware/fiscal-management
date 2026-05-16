import { beforeEach, describe, expect, it } from "vitest";
import { computeMonth, computeSavings } from "../engine.js";
import type { AppState } from "./state.js";
import { emptyAppState } from "./state.js";
import {
  exportAppStateJson,
  importAppStateJson,
  loadAppState,
  resetAppState,
  saveAppState,
} from "./storage.js";

const M = "2026-05";

function richAppState(): AppState {
  const base = emptyAppState(new Date("2026-05-16T10:00:00Z"));
  base.budget.categories.push(
    {
      id: "rent",
      name: "Rent",
      group: "Needs",
      archived: false,
      typeSegments: [{ fromMonth: M, type: "Limit" }],
    },
    {
      id: "fun",
      name: "Fun",
      group: "Wants",
      archived: false,
      typeSegments: [{ fromMonth: M, type: "Pot" }],
    },
  );
  base.budget.budgets.push(
    { categoryId: "rent", month: M, amount: 800 },
    { categoryId: "fun", month: M, amount: 100 },
  );
  base.budget.transactions.push({
    id: "t1",
    categoryId: "rent",
    date: "2026-05-01",
    amount: 800,
  });
  base.budget.savingsAccounts.push({ id: "emergency", name: "Emergency", startingBalance: 500 });
  base.budget.savingsEntries.push({ accountId: "emergency", month: M, amount: 200 });
  base.budget.income.push({ month: M, netAmount: 2000 });
  base.overspendAcks.push({ categoryId: "fun", month: M });
  return base;
}

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save → load round-trip preserves AppState", () => {
    const state = richAppState();
    saveAppState(state);
    const loaded = loadAppState();
    expect(loaded).toEqual(state);
  });

  it("JSON export → import reproduces identical state and identical engine output", () => {
    const state = richAppState();
    const json = exportAppStateJson(state);
    const imported = importAppStateJson(json);

    expect(imported).toEqual(state);

    const originalMonth = computeMonth(state.budget, M);
    const importedMonth = computeMonth(imported.budget, M);
    expect(importedMonth).toEqual(originalMonth);

    const originalSav = computeSavings(state.budget, M);
    const importedSav = computeSavings(imported.budget, M);
    expect(importedSav).toEqual(originalSav);
  });

  it("loadAppState returns empty default when nothing is stored", () => {
    const loaded = loadAppState();
    expect(loaded.budget.categories).toEqual([]);
    expect(loaded.budget.transactions).toEqual([]);
    expect(loaded.overspendAcks).toEqual([]);
  });

  it("resetAppState clears persisted data", () => {
    saveAppState(richAppState());
    resetAppState();
    const loaded = loadAppState();
    expect(loaded.budget.categories).toEqual([]);
  });

  it("normaliseAppState tolerates partial/garbage input", () => {
    const partial = importAppStateJson(JSON.stringify({ budget: { categories: [] } }));
    expect(partial.budget.transactions).toEqual([]);
    expect(partial.overspendAcks).toEqual([]);
    expect(partial.ui.selectedMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});
