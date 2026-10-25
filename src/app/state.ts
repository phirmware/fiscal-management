import type { BudgetState, IsoDate, Month } from "../types.js";

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

/**
 * Wealth tracking lives beside the budget, not inside it: the budget engine
 * models monthly flows, while these are point-in-time balances the user
 * enters by hand (no bank APIs yet).
 */
export type AccountKind =
  | "current"
  | "savings"
  | "investment"
  | "pension"
  | "property"
  | "crypto"
  | "otherAsset"
  | "creditCard"
  | "loan"
  | "mortgage"
  | "studentLoan"
  | "otherDebt";

export interface WealthAccount {
  id: string;
  name: string;
  kind: AccountKind;
  institution?: string;
  archived: boolean;
  /** Annual rate as a percentage — APR for debts, AER for savings. */
  rate?: number;
  /** Credit cards only. */
  creditLimit?: number;
  /** Debts: monthly repayment. Assets: monthly contribution. */
  monthlyPayment?: number;
  /** Counts toward the emergency fund. Unflagged cash is used when none are flagged. */
  emergencyFund?: boolean;
  createdAt: IsoDate;
}

/**
 * A balance as of a date. Liabilities are stored as positive amounts owed;
 * the sign is applied from the account kind. At most one per account per day.
 */
export interface BalanceSnapshot {
  id: string;
  accountId: string;
  date: IsoDate;
  balance: number;
  /** Money paid in since the previous snapshot — separates growth from deposits. */
  contribution?: number;
}

export interface FinancialProfile {
  birthYear?: number;
  grossAnnualIncome?: number;
  emergencyMonthsTarget: number;
}

export interface WealthState {
  accounts: WealthAccount[];
  snapshots: BalanceSnapshot[];
  profile: FinancialProfile;
}

export function emptyWealthState(): WealthState {
  return { accounts: [], snapshots: [], profile: { emergencyMonthsTarget: 6 } };
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
  wealth: WealthState;
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
    wealth: emptyWealthState(),
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
