export type Group = "Needs" | "Wants" | "Savings";

export type CategoryType = "Pot" | "Limit";

export type Month = string;

export type IsoDate = string;

export interface TypeSegment {
  fromMonth: Month;
  type: CategoryType;
}

export interface Category {
  id: string;
  name: string;
  group: Group;
  typeSegments: TypeSegment[];
  archived: boolean;
  annualTarget?: number;
}

export interface MonthlyBudget {
  categoryId: string;
  month: Month;
  amount: number;
}

export interface Transaction {
  id: string;
  categoryId: string;
  date: IsoDate;
  amount: number;
  note?: string;
}

export interface SavingsAccount {
  id: string;
  name: string;
  startingBalance: number;
}

export interface SavingsEntry {
  accountId: string;
  month: Month;
  amount: number;
}

export interface IncomeEntry {
  month: Month;
  netAmount: number;
}

export interface BudgetState {
  categories: Category[];
  budgets: MonthlyBudget[];
  transactions: Transaction[];
  savingsAccounts: SavingsAccount[];
  savingsEntries: SavingsEntry[];
  income: IncomeEntry[];
}

export interface CategoryMonthResult {
  categoryId: string;
  type: CategoryType;
  budgeted: number;
  spent: number;
  carryIn: number;
  available: number;
}

export interface MonthSummary {
  month: Month;
  income: number;
  incomeSet: boolean;
  totalBudgeted: number;
  totalSpent: number;
  unallocated: number;
  categories: CategoryMonthResult[];
  releasedFromConversions: number;
}

export interface SavingsSummary {
  monthTotal: number;
  cumulativeByAccount: Record<string, number>;
  cumulativeTotal: number;
}

export interface RangeMonthSummary extends MonthSummary {
  savings: SavingsSummary;
}
