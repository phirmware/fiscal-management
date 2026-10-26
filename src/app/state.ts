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
  /**
   * Credit cards only: the full statement balance is cleared every month.
   * The balance still counts toward net worth (it's owed today) but it's
   * treated as a payment method, not borrowing — no interest, no payoff plan.
   */
  paysInFull?: boolean;
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
  /**
   * Epoch ms when entered. A balance is treated as the account's state at
   * that moment: same-day entries logged before it are assumed included,
   * ones logged after it adjust the estimate.
   */
  recordedAt?: number;
}

export type IncomeSource = "salary" | "other";

/** Money arriving in an account from outside: salary, side income, a refund. */
export interface IncomeMovement {
  id: string;
  type: "income";
  date: IsoDate;
  /** Always positive. */
  amount: number;
  accountId: string;
  source: IncomeSource;
  /**
   * The budget month this counts toward, fixed when logged. Unset means it
   * doesn't touch budget income (e.g. a refund).
   */
  budgetMonth?: Month;
  note?: string;
  loggedAt: number;
  recurringId?: string;
}

/** Money moving between two of your own accounts. Never income or spending. */
export interface TransferMovement {
  id: string;
  type: "transfer";
  date: IsoDate;
  /** Always positive. */
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  note?: string;
  loggedAt: number;
  recurringId?: string;
}

/**
 * Real spending that sits outside the monthly budget — a holiday paid from
 * savings, a one-off big purchase. Lowers the account and counts in cash
 * flow, but never touches budget categories or "left to spend".
 */
export interface ExpenseMovement {
  id: string;
  type: "expense";
  date: IsoDate;
  /** Always positive. */
  amount: number;
  accountId: string;
  note?: string;
  loggedAt: number;
  recurringId?: string;
}

export type Movement = IncomeMovement | TransferMovement | ExpenseMovement;

/** Every account a movement touches. */
export function movementAccountIds(m: Movement): string[] {
  return m.type === "transfer" ? [m.fromAccountId, m.toAccountId] : [m.accountId];
}

/**
 * Budget moved from one category to another on a date — e.g. Gifts → a
 * December pot. Counts as a one-month adjustment to both categories (the
 * baseline budgets that drive next month's prefill are untouched) and is
 * never spending. If the money also physically moved, both accounts are set
 * and it behaves like a transfer in the ledger.
 */
export interface BudgetMove {
  id: string;
  date: IsoDate;
  /** Always positive. */
  amount: number;
  fromCategoryId: string;
  toCategoryId: string;
  /** Set together or not at all. */
  fromAccountId?: string;
  toAccountId?: string;
  note?: string;
  loggedAt: number;
}

/** Each move is −amount on its source and +amount on its target, in the month it's dated. */
export function moveReallocations(moves: BudgetMove[]): BudgetReallocation[] {
  const out: BudgetReallocation[] = [];
  for (const m of moves) {
    if (!(m.amount > 0) || m.fromCategoryId === m.toCategoryId) continue;
    const month = m.date.slice(0, 7);
    out.push({ categoryId: m.fromCategoryId, month, delta: -m.amount });
    out.push({ categoryId: m.toCategoryId, month, delta: m.amount });
  }
  return out;
}

/** Stored reallocations plus those implied by category moves. */
export function allReallocations(reallocations: BudgetReallocation[], moves: BudgetMove[]): BudgetReallocation[] {
  return moves.length === 0 ? reallocations : [...reallocations, ...moveReallocations(moves)];
}

export type RecurringTemplate =
  | { kind: "spend"; amount: number; categoryId: string; accountId?: string; note?: string }
  | {
      kind: "income";
      amount: number;
      accountId: string;
      source: IncomeSource;
      /** 0 = the month it arrives, 1 = the following month, null = not budget income. */
      budgetOffset: 0 | 1 | null;
      note?: string;
    }
  | {
      kind: "transfer";
      amount: number;
      fromAccountId: string;
      toAccountId: string;
      /** Card repayments: use whatever is owed at the time instead of a fixed amount. */
      payFullBalance?: boolean;
      note?: string;
    }
  | { kind: "expense"; amount: number; accountId: string; note?: string };

/** A monthly entry the app reminds you to log. Nothing is logged without you confirming. */
export interface RecurringRule {
  id: string;
  template: RecurringTemplate;
  /** Day of month, 1–31. Clamped to the month's length (31 → 30 Apr, 28/29 Feb). */
  day: number;
  /** First month it applies to. */
  startMonth: Month;
  paused?: boolean;
  /** Months deliberately skipped. */
  skipped: Month[];
}

export interface FinancialProfile {
  birthYear?: number;
  grossAnnualIncome?: number;
  emergencyMonthsTarget: number;
  /** Which budget month a salary logged today counts toward. */
  salaryMonth?: "same" | "next";
}

export interface WealthState {
  accounts: WealthAccount[];
  snapshots: BalanceSnapshot[];
  movements: Movement[];
  /** Kept with the wealth slice so the ledger and backups see them without extra plumbing. */
  moves: BudgetMove[];
  recurring: RecurringRule[];
  profile: FinancialProfile;
}

export function emptyWealthState(): WealthState {
  return { accounts: [], snapshots: [], movements: [], moves: [], recurring: [], profile: { emergencyMonthsTarget: 6 } };
}

export type ThemePreference = "light" | "dark" | "liquid" | "system";

export interface UiState {
  selectedMonth: Month;
  lastUsedCategoryId: string | null;
  /** Default "paid with" / "into" account for new entries. */
  lastUsedAccountId: string | null;
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
      lastUsedAccountId: null,
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
