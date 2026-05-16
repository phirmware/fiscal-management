import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  BudgetState,
  Category,
  CategoryType,
  Group,
  IncomeEntry,
  IsoDate,
  Month,
  MonthlyBudget,
  SavingsAccount,
  SavingsEntry,
  Transaction,
  TypeSegment,
} from "../types.js";
import type { AppState, OverspendAck, ReleaseAck, ThemePreference } from "./state.js";
import {
  exportAppStateJson,
  importAppStateJson,
  loadAppState,
  resetAppState,
  saveAppState,
} from "./storage.js";

export type Screen = "home" | "budget" | "transactions" | "insights" | "settings";

interface AppStore extends AppState {
  selectedScreen: Screen;

  setSelectedMonth: (month: Month) => void;
  setSelectedScreen: (screen: Screen) => void;
  setLastUsedCategory: (categoryId: string | null) => void;

  setIncome: (month: Month, netAmount: number) => void;

  addCategory: (input: {
    name: string;
    group: Group;
    type: CategoryType;
    fromMonth: Month;
    annualTarget?: number;
  }) => string;
  renameCategory: (id: string, name: string) => void;
  setCategoryGroup: (id: string, group: Group) => void;
  archiveCategory: (id: string, archived: boolean) => void;
  convertCategoryType: (id: string, fromMonth: Month, type: CategoryType) => void;

  setBudget: (categoryId: string, month: Month, amount: number) => void;

  addTransaction: (input: {
    categoryId: string;
    date: IsoDate;
    amount: number;
    note?: string;
  }) => string;
  editTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  deleteTransaction: (id: string) => void;

  addSavingsAccount: (input: { name: string; startingBalance?: number }) => string;
  setSavingsEntry: (accountId: string, month: Month, amount: number) => void;
  deleteSavingsEntry: (accountId: string, month: Month) => void;

  reallocateFromCategory: (
    donorId: string,
    recipientId: string,
    month: Month,
    amount: number,
  ) => void;
  coverFromUnallocated: (categoryId: string, month: Month, amount: number) => void;
  acknowledgeOverspend: (categoryId: string, month: Month) => void;
  unacknowledgeOverspend: (categoryId: string, month: Month) => void;

  sendReleaseToCategory: (
    convertedCategoryId: string,
    recipientId: string,
    month: Month,
    amount: number,
  ) => void;
  acknowledgeRelease: (categoryId: string, month: Month) => void;

  completeOnboarding: () => void;
  setTheme: (theme: ThemePreference) => void;

  exportJson: () => string;
  importJson: (json: string) => void;
  resetAll: () => void;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function upsertBudget(
  budgets: MonthlyBudget[],
  categoryId: string,
  month: Month,
  amount: number,
): MonthlyBudget[] {
  // We keep zero-amount records on purpose: the *presence* of a record
  // marks the month as user-reviewed and suppresses prefill from a prior month.
  const idx = budgets.findIndex((b) => b.categoryId === categoryId && b.month === month);
  if (idx === -1) return [...budgets, { categoryId, month, amount }];
  const next = budgets.slice();
  next[idx] = { categoryId, month, amount };
  return next;
}

function changeBudget(
  budgets: MonthlyBudget[],
  categoryId: string,
  month: Month,
  delta: number,
): MonthlyBudget[] {
  const idx = budgets.findIndex((b) => b.categoryId === categoryId && b.month === month);
  if (idx === -1) {
    return [...budgets, { categoryId, month, amount: delta }];
  }
  const current = budgets[idx]!;
  const next = budgets.slice();
  next[idx] = { ...current, amount: current.amount + delta };
  return next;
}

function upsertIncome(
  income: IncomeEntry[],
  month: Month,
  netAmount: number,
): IncomeEntry[] {
  const idx = income.findIndex((i) => i.month === month);
  if (idx === -1) {
    return [...income, { month, netAmount }];
  }
  const next = income.slice();
  next[idx] = { month, netAmount };
  return next;
}

function upsertSavingsEntry(
  entries: SavingsEntry[],
  accountId: string,
  month: Month,
  amount: number,
): SavingsEntry[] {
  const idx = entries.findIndex((e) => e.accountId === accountId && e.month === month);
  if (idx === -1) {
    if (amount === 0) return entries;
    return [...entries, { accountId, month, amount }];
  }
  if (amount === 0) {
    return [...entries.slice(0, idx), ...entries.slice(idx + 1)];
  }
  const next = entries.slice();
  next[idx] = { accountId, month, amount };
  return next;
}

function insertSegmentSorted(
  segs: TypeSegment[],
  fromMonth: Month,
  type: CategoryType,
): TypeSegment[] {
  const filtered = segs.filter((s) => s.fromMonth !== fromMonth);
  filtered.push({ fromMonth, type });
  filtered.sort((a, b) => (a.fromMonth < b.fromMonth ? -1 : 1));
  return filtered;
}

const initial = loadAppState();

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    ...initial,
    selectedScreen: "home",

    setSelectedMonth: (month) => set((s) => ({ ui: { ...s.ui, selectedMonth: month } })),
    setSelectedScreen: (screen) => set({ selectedScreen: screen }),
    setLastUsedCategory: (categoryId) =>
      set((s) => ({ ui: { ...s.ui, lastUsedCategoryId: categoryId } })),

    setIncome: (month, netAmount) =>
      set((s) => ({
        budget: { ...s.budget, income: upsertIncome(s.budget.income, month, netAmount) },
      })),

    addCategory: ({ name, group, type, fromMonth, annualTarget }) => {
      const id = newId();
      const cat: Category = {
        id,
        name,
        group,
        archived: false,
        typeSegments: [{ fromMonth, type }],
        ...(annualTarget !== undefined ? { annualTarget } : {}),
      };
      set((s) => ({ budget: { ...s.budget, categories: [...s.budget.categories, cat] } }));
      return id;
    },

    renameCategory: (id, name) =>
      set((s) => ({
        budget: {
          ...s.budget,
          categories: s.budget.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        },
      })),

    setCategoryGroup: (id, group) =>
      set((s) => ({
        budget: {
          ...s.budget,
          categories: s.budget.categories.map((c) => (c.id === id ? { ...c, group } : c)),
        },
      })),

    archiveCategory: (id, archived) =>
      set((s) => ({
        budget: {
          ...s.budget,
          categories: s.budget.categories.map((c) => (c.id === id ? { ...c, archived } : c)),
        },
      })),

    convertCategoryType: (id, fromMonth, type) =>
      set((s) => ({
        budget: {
          ...s.budget,
          categories: s.budget.categories.map((c) =>
            c.id === id
              ? { ...c, typeSegments: insertSegmentSorted(c.typeSegments, fromMonth, type) }
              : c,
          ),
        },
      })),

    setBudget: (categoryId, month, amount) =>
      set((s) => ({
        budget: { ...s.budget, budgets: upsertBudget(s.budget.budgets, categoryId, month, amount) },
      })),

    addTransaction: ({ categoryId, date, amount, note }) => {
      const id = newId();
      const txn: Transaction = {
        id,
        categoryId,
        date,
        amount,
        ...(note ? { note } : {}),
      };
      set((s) => ({
        budget: { ...s.budget, transactions: [...s.budget.transactions, txn] },
        ui: { ...s.ui, lastUsedCategoryId: categoryId },
      }));
      return id;
    },

    editTransaction: (id, patch) =>
      set((s) => ({
        budget: {
          ...s.budget,
          transactions: s.budget.transactions.map((t) =>
            t.id === id ? { ...t, ...patch } : t,
          ),
        },
      })),

    deleteTransaction: (id) =>
      set((s) => ({
        budget: {
          ...s.budget,
          transactions: s.budget.transactions.filter((t) => t.id !== id),
        },
      })),

    addSavingsAccount: ({ name, startingBalance = 0 }) => {
      const id = newId();
      const acc: SavingsAccount = { id, name, startingBalance };
      set((s) => ({
        budget: { ...s.budget, savingsAccounts: [...s.budget.savingsAccounts, acc] },
      }));
      return id;
    },

    setSavingsEntry: (accountId, month, amount) =>
      set((s) => ({
        budget: {
          ...s.budget,
          savingsEntries: upsertSavingsEntry(s.budget.savingsEntries, accountId, month, amount),
        },
      })),

    deleteSavingsEntry: (accountId, month) =>
      set((s) => ({
        budget: {
          ...s.budget,
          savingsEntries: s.budget.savingsEntries.filter(
            (e) => !(e.accountId === accountId && e.month === month),
          ),
        },
      })),

    reallocateFromCategory: (donorId, recipientId, month, amount) => {
      if (amount <= 0) return;
      set((s) => {
        let budgets = changeBudget(s.budget.budgets, donorId, month, -amount);
        budgets = changeBudget(budgets, recipientId, month, amount);
        return { budget: { ...s.budget, budgets } };
      });
    },

    coverFromUnallocated: (categoryId, month, amount) => {
      if (amount <= 0) return;
      set((s) => ({
        budget: { ...s.budget, budgets: changeBudget(s.budget.budgets, categoryId, month, amount) },
      }));
    },

    acknowledgeOverspend: (categoryId, month) =>
      set((s) => {
        const exists = s.overspendAcks.some(
          (a) => a.categoryId === categoryId && a.month === month,
        );
        if (exists) return {};
        const ack: OverspendAck = { categoryId, month };
        return { overspendAcks: [...s.overspendAcks, ack] };
      }),

    unacknowledgeOverspend: (categoryId, month) =>
      set((s) => ({
        overspendAcks: s.overspendAcks.filter(
          (a) => !(a.categoryId === categoryId && a.month === month),
        ),
      })),

    sendReleaseToCategory: (convertedCategoryId, recipientId, month, amount) => {
      if (amount === 0) return;
      set((s) => ({
        budget: { ...s.budget, budgets: changeBudget(s.budget.budgets, recipientId, month, amount) },
        releaseAcks: s.releaseAcks.some(
          (a) => a.categoryId === convertedCategoryId && a.month === month,
        )
          ? s.releaseAcks
          : [...s.releaseAcks, { categoryId: convertedCategoryId, month }],
      }));
    },

    acknowledgeRelease: (categoryId, month) =>
      set((s) => {
        const exists = s.releaseAcks.some(
          (a) => a.categoryId === categoryId && a.month === month,
        );
        if (exists) return {};
        const ack: ReleaseAck = { categoryId, month };
        return { releaseAcks: [...s.releaseAcks, ack] };
      }),

    completeOnboarding: () => set((s) => ({ ui: { ...s.ui, hasOnboarded: true } })),
    setTheme: (theme) => set((s) => ({ ui: { ...s.ui, theme } })),

    exportJson: () => {
      const s = get();
      const snapshot: AppState = {
        version: s.version,
        budget: s.budget,
        overspendAcks: s.overspendAcks,
        releaseAcks: s.releaseAcks,
        ui: s.ui,
      };
      return exportAppStateJson(snapshot);
    },

    importJson: (json) => {
      const next = importAppStateJson(json);
      set({
        version: next.version,
        budget: next.budget,
        overspendAcks: next.overspendAcks,
        releaseAcks: next.releaseAcks,
        ui: next.ui,
      });
    },

    resetAll: () => {
      resetAppState();
      const fresh = loadAppState();
      set({
        version: fresh.version,
        budget: fresh.budget,
        overspendAcks: fresh.overspendAcks,
        releaseAcks: fresh.releaseAcks,
        ui: fresh.ui,
        selectedScreen: "home",
      });
    },
  })),
);

useAppStore.subscribe(
  (s) => ({
    version: s.version,
    budget: s.budget,
    overspendAcks: s.overspendAcks,
    releaseAcks: s.releaseAcks,
    ui: s.ui,
  }),
  (slice) => {
    saveAppState(slice as AppState);
  },
  {
    equalityFn: (a, b) =>
      a.budget === b.budget &&
      a.overspendAcks === b.overspendAcks &&
      a.releaseAcks === b.releaseAcks &&
      a.ui === b.ui,
  },
);
