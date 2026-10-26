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
import type {
  AccountKind,
  AppState,
  BalanceSnapshot,
  ExpenseMovement,
  FinancialProfile,
  IncomeMovement,
  Movement,
  OverspendAck,
  ReleaseAck,
  RecurringRule,
  RecurringTemplate,
  ThemePreference,
  TransferMovement,
  WealthAccount,
} from "./state.js";
import { movementAccountIds } from "./state.js";
import { roundMoney } from "./utils/money.js";
import { todayIso } from "./utils/month.js";
import {
  exportAppStateJson,
  importAppStateJson,
  loadAppState,
  resetAppState,
  saveAppState,
} from "./storage.js";

export type Screen = "home" | "budget" | "transactions" | "wealth" | "insights" | "settings";

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
    accountId?: string;
    /** Only for undo — restores the original ordering against check-ins. */
    loggedAt?: number;
    recurringId?: string;
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

  clearReallocations: (categoryId: string, month: Month) => void;

  addAccount: (input: {
    name: string;
    kind: AccountKind;
    institution?: string;
    rate?: number;
    creditLimit?: number;
    monthlyPayment?: number;
    emergencyFund?: boolean;
    openingBalance?: number;
    date: IsoDate;
  }) => string;
  updateAccount: (id: string, patch: Partial<Omit<WealthAccount, "id" | "createdAt">>) => void;
  deleteAccount: (id: string) => void;
  recordBalance: (input: {
    accountId: string;
    date: IsoDate;
    balance: number;
    contribution?: number;
  }) => void;
  deleteSnapshot: (id: string) => void;
  addMovement: (input: MovementInput) => string | null;
  editMovement: (id: string, input: MovementInput) => boolean;
  deleteMovement: (id: string) => void;
  addRecurring: (input: { template: RecurringTemplate; day: number; startMonth: Month }) => string | null;
  setRecurringPaused: (id: string, paused: boolean) => void;
  deleteRecurring: (id: string) => void;
  skipOccurrence: (id: string, month: Month) => void;
  setProfile: (patch: Partial<FinancialProfile>) => void;

  completeOnboarding: () => void;
  setTheme: (theme: ThemePreference) => void;

  exportJson: () => string;
  importJson: (json: string) => void;
  resetAll: () => void;
}

type Distribute<T> = T extends Movement ? Omit<T, "id" | "loggedAt"> & { loggedAt?: number } : never;
export type MovementInput = Distribute<Movement>;

/**
 * Rejects movements the ledger can't represent: non-positive or non-finite
 * amounts, a transfer to the same account, or unknown accounts.
 */
export function validMovement(m: MovementInput, accountIds: Set<string>): boolean {
  if (!Number.isFinite(m.amount) || m.amount <= 0) return false;
  if (m.type !== "transfer") return accountIds.has(m.accountId);
  return (
    m.fromAccountId !== m.toAccountId &&
    accountIds.has(m.fromAccountId) &&
    accountIds.has(m.toAccountId)
  );
}

function buildMovement(id: string, m: MovementInput, loggedAt: number): Movement {
  const amount = roundMoney(m.amount);
  const note = m.note?.trim() ? { note: m.note.trim() } : {};
  const rec = m.recurringId ? { recurringId: m.recurringId } : {};
  if (m.type === "expense") {
    const out: ExpenseMovement = { id, type: "expense", date: m.date, amount, accountId: m.accountId, ...note, ...rec, loggedAt };
    return out;
  }
  if (m.type === "income") {
    const out: IncomeMovement = {
      id,
      type: "income",
      date: m.date,
      amount,
      accountId: m.accountId,
      source: m.source,
      ...(m.budgetMonth ? { budgetMonth: m.budgetMonth } : {}),
      ...note,
      ...rec,
      loggedAt,
    };
    return out;
  }
  const out: TransferMovement = {
    id,
    type: "transfer",
    date: m.date,
    amount,
    fromAccountId: m.fromAccountId,
    toAccountId: m.toAccountId,
    ...note,
    ...rec,
    loggedAt,
  };
  return out;
}

/** Every account a repeating rule would touch. */
export function templateAccountIds(t: RecurringTemplate): string[] {
  if (t.kind === "transfer") return [t.fromAccountId, t.toAccountId];
  if (t.kind === "spend") return t.accountId ? [t.accountId] : [];
  return [t.accountId];
}

export function validTemplate(t: RecurringTemplate, accountIds: Set<string>, categoryIds: Set<string>): boolean {
  const fullBalance = t.kind === "transfer" && t.payFullBalance;
  if (!Number.isFinite(t.amount) || (!fullBalance && t.amount <= 0) || t.amount < 0) return false;
  if (t.kind === "spend" && !categoryIds.has(t.categoryId)) return false;
  if (t.kind === "transfer" && t.fromAccountId === t.toAccountId) return false;
  return templateAccountIds(t).every((id) => accountIds.has(id));
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

/** One snapshot per account per day — re-entering today's balance replaces it. */
function upsertSnapshot(
  snapshots: BalanceSnapshot[],
  input: { accountId: string; date: IsoDate; balance: number; contribution?: number },
): BalanceSnapshot[] {
  const idx = snapshots.findIndex(
    (x) => x.accountId === input.accountId && x.date === input.date,
  );
  const snap: BalanceSnapshot = {
    id: idx === -1 ? newId() : snapshots[idx]!.id,
    accountId: input.accountId,
    date: input.date,
    balance: input.balance,
    ...(input.contribution ? { contribution: input.contribution } : {}),
    // Today's balance is "as of now"; a backdated one is that day's closing balance,
    // so leaving recordedAt unset makes every same-day entry count as included.
    ...(input.date === todayIso() ? { recordedAt: Date.now() } : {}),
  };
  if (idx === -1) return [...snapshots, snap];
  const next = snapshots.slice();
  next[idx] = snap;
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
        // Explicitly setting a budget for a cell supersedes any reallocations
        // applied to it — the user is declaring "this is the budget".
        reallocations: s.reallocations.filter(
          (r) => !(r.categoryId === categoryId && r.month === month),
        ),
      })),

    addTransaction: ({ categoryId, date, amount, note, accountId, loggedAt, recurringId }) => {
      const id = newId();
      const txn: Transaction = {
        id,
        categoryId,
        date,
        amount,
        ...(note ? { note } : {}),
        ...(accountId ? { accountId } : {}),
        ...(recurringId ? { recurringId } : {}),
        loggedAt: loggedAt ?? Date.now(),
      };
      set((s) => ({
        budget: { ...s.budget, transactions: [...s.budget.transactions, txn] },
        ui: {
          ...s.ui,
          lastUsedCategoryId: categoryId,
          ...(accountId ? { lastUsedAccountId: accountId } : {}),
        },
      }));
      return id;
    },

    editTransaction: (id, patch) =>
      set((s) => ({
        budget: {
          ...s.budget,
          transactions: s.budget.transactions.map((t) => {
            if (t.id !== id) return t;
            const next = { ...t, ...patch };
            // Clearing "paid with" must remove the key, not leave `undefined` behind.
            if (!next.accountId) delete next.accountId;
            return next;
          }),
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
      // Reallocations live in their own collection so the next month's prefill
      // still sees the baseline budget, not the post-fix amount.
      if (amount <= 0) return;
      set((s) => ({
        reallocations: [
          ...s.reallocations,
          { categoryId: donorId, month, delta: -amount },
          { categoryId: recipientId, month, delta: amount },
        ],
      }));
    },

    coverFromUnallocated: (categoryId, month, amount) => {
      if (amount <= 0) return;
      set((s) => ({
        reallocations: [...s.reallocations, { categoryId, month, delta: amount }],
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
        reallocations: [...s.reallocations, { categoryId: recipientId, month, delta: amount }],
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

    clearReallocations: (categoryId, month) =>
      set((s) => ({
        reallocations: s.reallocations.filter(
          (r) => !(r.categoryId === categoryId && r.month === month),
        ),
      })),

    addAccount: ({ openingBalance, date, ...rest }) => {
      const id = newId();
      const account: WealthAccount = { id, archived: false, createdAt: date, ...rest };
      set((s) => ({
        wealth: {
          ...s.wealth,
          accounts: [...s.wealth.accounts, account],
          snapshots:
            openingBalance === undefined
              ? s.wealth.snapshots
              : upsertSnapshot(s.wealth.snapshots, { accountId: id, date, balance: openingBalance }),
        },
      }));
      return id;
    },

    updateAccount: (id, patch) =>
      set((s) => ({
        wealth: {
          ...s.wealth,
          accounts: s.wealth.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        },
      })),

    deleteAccount: (id) =>
      set((s) => ({
        wealth: {
          ...s.wealth,
          accounts: s.wealth.accounts.filter((a) => a.id !== id),
          snapshots: s.wealth.snapshots.filter((x) => x.accountId !== id),
          // Movements can't exist half-attached: drop any that touch the account.
          movements: s.wealth.movements.filter((m) => !movementAccountIds(m).includes(id)),
          // Rules that would log against a missing account are removed too.
          recurring: s.wealth.recurring.filter((r) => !templateAccountIds(r.template).includes(id)),
        },
        // Spending stays in the budget; it just stops pointing at a missing account.
        budget: s.budget.transactions.some((t) => t.accountId === id)
          ? {
              ...s.budget,
              transactions: s.budget.transactions.map((t) => {
                if (t.accountId !== id) return t;
                const { accountId: _drop, ...rest } = t;
                return rest;
              }),
            }
          : s.budget,
        ui: s.ui.lastUsedAccountId === id ? { ...s.ui, lastUsedAccountId: null } : s.ui,
      })),

    recordBalance: (input) =>
      set((s) => ({
        wealth: { ...s.wealth, snapshots: upsertSnapshot(s.wealth.snapshots, input) },
      })),

    deleteSnapshot: (id) =>
      set((s) => ({
        wealth: { ...s.wealth, snapshots: s.wealth.snapshots.filter((x) => x.id !== id) },
      })),

    addMovement: (input) => {
      const ids = new Set(get().wealth.accounts.map((a) => a.id));
      if (!validMovement(input, ids)) return null;
      const id = newId();
      const m = buildMovement(id, input, input.loggedAt ?? Date.now());
      set((s) => ({
        wealth: { ...s.wealth, movements: [...s.wealth.movements, m] },
        ui: {
          ...s.ui,
          lastUsedAccountId: m.type === "transfer" ? m.fromAccountId : m.accountId,
        },
      }));
      return id;
    },

    editMovement: (id, input) => {
      const s0 = get();
      const existing = s0.wealth.movements.find((m) => m.id === id);
      const ids = new Set(s0.wealth.accounts.map((a) => a.id));
      if (!existing || !validMovement(input, ids)) return false;
      // Keep the original log time: editing a typo shouldn't reorder it against check-ins.
      const next = buildMovement(id, input, existing.loggedAt);
      set((s) => ({
        wealth: {
          ...s.wealth,
          movements: s.wealth.movements.map((m) => (m.id === id ? next : m)),
        },
      }));
      return true;
    },

    deleteMovement: (id) =>
      set((s) => ({
        wealth: { ...s.wealth, movements: s.wealth.movements.filter((m) => m.id !== id) },
      })),

    addRecurring: ({ template, day, startMonth }) => {
      const s0 = get();
      const accountIds = new Set(s0.wealth.accounts.map((a) => a.id));
      const categoryIds = new Set(s0.budget.categories.map((c) => c.id));
      if (!validTemplate(template, accountIds, categoryIds)) return null;
      if (!Number.isInteger(day) || day < 1 || day > 31) return null;
      const id = newId();
      const rule: RecurringRule = { id, template: { ...template, amount: roundMoney(template.amount) }, day, startMonth, skipped: [] };
      set((s) => ({ wealth: { ...s.wealth, recurring: [...s.wealth.recurring, rule] } }));
      return id;
    },

    setRecurringPaused: (id, paused) =>
      set((s) => ({
        wealth: {
          ...s.wealth,
          recurring: s.wealth.recurring.map((r) => (r.id === id ? { ...r, paused } : r)),
        },
      })),

    deleteRecurring: (id) =>
      set((s) => ({ wealth: { ...s.wealth, recurring: s.wealth.recurring.filter((r) => r.id !== id) } })),

    skipOccurrence: (id, month) =>
      set((s) => ({
        wealth: {
          ...s.wealth,
          recurring: s.wealth.recurring.map((r) =>
            r.id === id && !r.skipped.includes(month) ? { ...r, skipped: [...r.skipped, month] } : r,
          ),
        },
      })),

    setProfile: (patch) =>
      set((s) => ({ wealth: { ...s.wealth, profile: { ...s.wealth.profile, ...patch } } })),

    completeOnboarding: () => set((s) => ({ ui: { ...s.ui, hasOnboarded: true } })),
    setTheme: (theme) => set((s) => ({ ui: { ...s.ui, theme } })),

    exportJson: () => {
      const s = get();
      const snapshot: AppState = {
        version: s.version,
        budget: s.budget,
        overspendAcks: s.overspendAcks,
        releaseAcks: s.releaseAcks,
        reallocations: s.reallocations,
        wealth: s.wealth,
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
        reallocations: next.reallocations,
        wealth: next.wealth,
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
        reallocations: fresh.reallocations,
        wealth: fresh.wealth,
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
    reallocations: s.reallocations,
    wealth: s.wealth,
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
      a.reallocations === b.reallocations &&
      a.wealth === b.wealth &&
      a.ui === b.ui,
  },
);
