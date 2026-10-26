import { computeMonth, createMonthCache } from "../engine.js";
import type { BudgetState, Category, IsoDate, Month, Transaction } from "../types.js";
import { savingsThisMonth } from "./derived.js";
import type {
  AccountKind,
  BalanceSnapshot,
  Movement,
  FinancialProfile,
  WealthAccount,
  WealthState,
} from "./state.js";
import { roundMoney } from "./utils/money.js";
import { addMonths, monthsBetween, parseIsoDateLocal } from "./utils/month.js";

// ─── Account kinds ──────────────────────────────────────────────────────────

export type AssetClass = "cash" | "invest" | "pension" | "property" | "other";

export interface KindMeta {
  label: string;
  /** Short helper copy for the kind picker. */
  hint: string;
  liability: boolean;
  /** Asset class for assets; null for liabilities. */
  assetClass: AssetClass | null;
  /** Expensive, unsecured borrowing — the debt worth killing first. */
  consumerDebt: boolean;
}

export const KIND_META: Record<AccountKind, KindMeta> = {
  current: { label: "Current account", hint: "Day-to-day banking", liability: false, assetClass: "cash", consumerDebt: false },
  savings: { label: "Savings", hint: "Easy access, fixed term, cash ISA", liability: false, assetClass: "cash", consumerDebt: false },
  investment: { label: "Investments", hint: "Stocks & shares ISA, LISA, GIA", liability: false, assetClass: "invest", consumerDebt: false },
  pension: { label: "Pension", hint: "Workplace, SIPP, personal", liability: false, assetClass: "pension", consumerDebt: false },
  property: { label: "Property", hint: "Estimated value of a home", liability: false, assetClass: "property", consumerDebt: false },
  crypto: { label: "Crypto", hint: "Exchange or wallet holdings", liability: false, assetClass: "invest", consumerDebt: false },
  otherAsset: { label: "Other asset", hint: "Car, premium bonds, money owed to you", liability: false, assetClass: "other", consumerDebt: false },
  creditCard: { label: "Credit card", hint: "Balance owed", liability: true, assetClass: null, consumerDebt: true },
  loan: { label: "Loan", hint: "Personal loan, car finance, BNPL", liability: true, assetClass: null, consumerDebt: true },
  mortgage: { label: "Mortgage", hint: "Outstanding balance", liability: true, assetClass: null, consumerDebt: false },
  studentLoan: { label: "Student loan", hint: "Income-contingent repayments", liability: true, assetClass: null, consumerDebt: false },
  otherDebt: { label: "Other debt", hint: "Overdraft, money owed to family", liability: true, assetClass: null, consumerDebt: true },
};

export const ASSET_KINDS: AccountKind[] = [
  "current",
  "savings",
  "investment",
  "pension",
  "property",
  "crypto",
  "otherAsset",
];
export const LIABILITY_KINDS: AccountKind[] = [
  "creditCard",
  "loan",
  "mortgage",
  "studentLoan",
  "otherDebt",
];

export const ASSET_CLASS_META: Record<AssetClass, { label: string; colourVar: string }> = {
  cash: { label: "Cash", colourVar: "--c-asset-cash" },
  invest: { label: "Investments", colourVar: "--c-asset-invest" },
  pension: { label: "Pensions", colourVar: "--c-asset-pension" },
  property: { label: "Property", colourVar: "--c-asset-property" },
  other: { label: "Other", colourVar: "--c-asset-other" },
};
export const ASSET_CLASSES: AssetClass[] = ["cash", "invest", "pension", "property", "other"];

export function isLiability(account: Pick<WealthAccount, "kind">): boolean {
  return KIND_META[account.kind].liability;
}

/** Debt that's carried month to month — excludes cards cleared in full each month. */
export function carriesBalance(account: Pick<WealthAccount, "kind" | "paysInFull">): boolean {
  return KIND_META[account.kind].liability && !(account.kind === "creditCard" && account.paysInFull);
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** Last calendar day of `month` as YYYY-MM-DD. */
export function monthEnd(month: Month): IsoDate {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function daysBetween(fromIso: IsoDate, toIso: IsoDate): number {
  const a = parseIsoDateLocal(fromIso);
  const b = parseIsoDateLocal(toIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ─── Ledger: check-ins + logged movements ───────────────────────────────────
//
// Balances the user enters ("check-ins") are the source of truth. Between
// check-ins, logged entries — spending paid with an account, income into it,
// transfers in or out — move an *estimated* balance. A new check-in resets the
// estimate, so a forgotten entry can never compound into later months.

/** Snapshots per account, oldest first. Built once per render pass. */
export function indexSnapshots(snapshots: BalanceSnapshot[]): Map<string, BalanceSnapshot[]> {
  const map = new Map<string, BalanceSnapshot[]>();
  for (const s of snapshots) {
    const list = map.get(s.accountId);
    if (list) list.push(s);
    else map.set(s.accountId, [s]);
  }
  for (const list of map.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return map;
}

/** Most recent snapshot on or before `date`, or null if the account had no balance yet. */
export function snapshotAt(history: BalanceSnapshot[] | undefined, date: IsoDate): BalanceSnapshot | null {
  if (!history) return null;
  let found: BalanceSnapshot | null = null;
  for (const s of history) {
    if (s.date > date) break;
    found = s;
  }
  return found;
}

export type FlowKind = "spend" | "income" | "expense" | "transferIn" | "transferOut";

/** One logged entry's effect on one account. */
export interface Flow {
  /** Id of the source transaction or movement. */
  sourceId: string;
  kind: FlowKind;
  date: IsoDate;
  loggedAt?: number;
  /**
   * Change to the account's *stored* balance. Assets store money held, so
   * spending is negative; liabilities store money owed, so spending on a
   * card is positive and a repayment is negative.
   */
  delta: number;
}

export interface Ledger {
  snapshots: Map<string, BalanceSnapshot[]>;
  flows: Map<string, Flow[]>;
}

/**
 * Turns spending (with a "paid with" account), income and transfers into
 * per-account flows. Entries pointing at unknown accounts are ignored rather
 * than guessed at.
 */
export function buildLedger(wealth: WealthState, transactions: Transaction[] = []): Ledger {
  const liability = new Map<string, boolean>();
  for (const a of wealth.accounts) liability.set(a.id, KIND_META[a.kind].liability);
  const flows = new Map<string, Flow[]>();
  // `value` is the change in what the account is worth to you (+ = richer).
  const push = (accountId: string, value: number, f: Omit<Flow, "delta">) => {
    const isLiab = liability.get(accountId);
    if (isLiab === undefined || value === 0) return;
    const flow: Flow = { ...f, delta: isLiab ? -value : value };
    const list = flows.get(accountId);
    if (list) list.push(flow);
    else flows.set(accountId, [flow]);
  };
  for (const t of transactions) {
    if (!t.accountId) continue;
    push(t.accountId, -t.amount, { sourceId: t.id, kind: "spend", date: t.date, loggedAt: t.loggedAt });
  }
  for (const m of wealth.movements) {
    if (!(m.amount > 0)) continue;
    if (m.type === "income") {
      push(m.accountId, m.amount, { sourceId: m.id, kind: "income", date: m.date, loggedAt: m.loggedAt });
    } else if (m.type === "expense") {
      push(m.accountId, -m.amount, { sourceId: m.id, kind: "expense", date: m.date, loggedAt: m.loggedAt });
    } else if (m.fromAccountId !== m.toAccountId) {
      push(m.fromAccountId, -m.amount, { sourceId: m.id, kind: "transferOut", date: m.date, loggedAt: m.loggedAt });
      push(m.toAccountId, m.amount, { sourceId: m.id, kind: "transferIn", date: m.date, loggedAt: m.loggedAt });
    }
  }
  for (const list of flows.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.loggedAt ?? 0) - (b.loggedAt ?? 0)));
  }
  return { snapshots: indexSnapshots(wealth.snapshots), flows };
}

/**
 * Did this entry happen after the check-in? Later dates always do. On the
 * same day it only counts if it was logged after the balance was entered —
 * otherwise the balance the user typed already included it. Without both
 * timestamps (older data, backdated check-ins) a same-day entry is assumed
 * to be included, which can't double-count.
 */
export function isAfterCheckIn(flow: Pick<Flow, "date" | "loggedAt">, snap: BalanceSnapshot): boolean {
  if (flow.date !== snap.date) return flow.date > snap.date;
  return flow.loggedAt !== undefined && snap.recordedAt !== undefined && flow.loggedAt > snap.recordedAt;
}

export interface LedgerBalance {
  balance: number;
  /** The check-in the estimate starts from. */
  anchor: BalanceSnapshot;
  /** Entries applied on top of the anchor. */
  pending: Flow[];
  adjustment: number;
}

/** Estimated balance at the end of `date`, or null before the first check-in. */
export function balanceOn(ledger: Ledger, accountId: string, date: IsoDate): LedgerBalance | null {
  const anchor = snapshotAt(ledger.snapshots.get(accountId), date);
  if (!anchor) return null;
  const pending = (ledger.flows.get(accountId) ?? []).filter((f) => f.date <= date && isAfterCheckIn(f, anchor));
  const adjustment = roundMoney(pending.reduce((s, f) => s + f.delta, 0));
  return { balance: roundMoney(anchor.balance + adjustment), anchor, pending, adjustment };
}

export interface NetWorthPoint {
  date: IsoDate;
  assets: number;
  liabilities: number;
  netWorth: number;
  byClass: Record<AssetClass, number>;
}

function emptyByClass(): Record<AssetClass, number> {
  return { cash: 0, invest: 0, pension: 0, property: 0, other: 0 };
}

/**
 * Net worth at the end of `date`: each account's latest check-in carried
 * forward, adjusted by entries logged since. Archived accounts still count
 * for dates before they were closed out, so history stays honest; a closed
 * account should simply have a final £0 check-in.
 */
export function netWorthAt(wealth: WealthState, date: IsoDate, ledger: Ledger = buildLedger(wealth)): NetWorthPoint {
  const byClass = emptyByClass();
  let liabilities = 0;
  for (const acc of wealth.accounts) {
    const b = balanceOn(ledger, acc.id, date);
    if (!b) continue;
    const meta = KIND_META[acc.kind];
    if (meta.liability) liabilities += b.balance;
    else byClass[meta.assetClass!] += b.balance;
  }
  for (const k of ASSET_CLASSES) byClass[k] = roundMoney(byClass[k]);
  const assets = roundMoney(ASSET_CLASSES.reduce((s, k) => s + byClass[k], 0));
  liabilities = roundMoney(liabilities);
  return { date, assets, liabilities, netWorth: roundMoney(assets - liabilities), byClass };
}

export interface MonthlyNetWorth extends NetWorthPoint {
  month: Month;
  /** False before the first ever snapshot — the chart shows a gap, not £0. */
  hasData: boolean;
}

/**
 * Month-end net worth. `cap` (usually today) stops the current month from
 * counting future-dated entries.
 */
export function netWorthSeries(
  wealth: WealthState,
  fromMonth: Month,
  toMonth: Month,
  transactions: Transaction[] = [],
  cap?: IsoDate,
): MonthlyNetWorth[] {
  const ledger = buildLedger(wealth, transactions);
  const first = firstSnapshotDate(wealth);
  return monthsBetween(fromMonth, toMonth).map((m) => {
    const end = monthEnd(m);
    const at = cap && cap < end ? cap : end;
    return { month: m, hasData: first !== null && first <= end, ...netWorthAt(wealth, at, ledger) };
  });
}

export function firstSnapshotDate(wealth: WealthState): IsoDate | null {
  let first: IsoDate | null = null;
  for (const s of wealth.snapshots) if (!first || s.date < first) first = s.date;
  return first;
}

export interface Reconciliation {
  /** Previous check-in plus the entries logged in between. */
  expected: number;
  /** Actual − expected. Non-zero means something wasn't logged (or interest, fees, growth). */
  gap: number;
  entries: number;
}

export interface AccountView {
  account: WealthAccount;
  /** Estimated balance: last check-in adjusted by entries since. */
  balance: number | null;
  /** Balance as a signed contribution to net worth. */
  signed: number;
  /** Last check-in date — staleness is about check-ins, not entries. */
  lastUpdated: IsoDate | null;
  daysSinceUpdate: number | null;
  /** Last check-in balance, before entries logged since. */
  checkInBalance: number | null;
  /** Entries applied since the last check-in. */
  pending: Flow[];
  /** True when logged entries have moved the balance away from the last check-in. */
  estimated: boolean;
  /** Change versus the check-in before the latest one. */
  change: number | null;
  /** Investments/pensions: cumulative growth net of logged contributions. */
  growth: number | null;
  contributed: number;
  history: BalanceSnapshot[];
  /** Per check-in (after the first): how it compared with what was logged. Only where entries existed. */
  reconciliation: Record<string, Reconciliation>;
}

export function accountViews(
  wealth: WealthState,
  asOf: IsoDate,
  today: IsoDate,
  transactions: Transaction[] = [],
): AccountView[] {
  const ledger = buildLedger(wealth, transactions);
  return wealth.accounts.map((account) => {
    const all = ledger.snapshots.get(account.id) ?? [];
    const flows = ledger.flows.get(account.id) ?? [];
    const history = all.filter((s) => s.date <= asOf);
    const latest = history[history.length - 1] ?? null;
    const prior = history[history.length - 2] ?? null;
    const liability = isLiability(account);
    const est = balanceOn(ledger, account.id, asOf);
    const balance = est ? est.balance : null;

    let contributed = 0;
    for (let i = 1; i < history.length; i++) contributed += history[i]!.contribution ?? 0;
    const first = history[0];
    const tracksGrowth = account.kind === "investment" || account.kind === "pension" || account.kind === "crypto";
    const growth =
      tracksGrowth && latest && first && history.length > 1
        ? roundMoney(latest.balance - first.balance - contributed)
        : null;

    const reconciliation: Record<string, Reconciliation> = {};
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1]!;
      const cur = history[i]!;
      const between = flows.filter((f) => isAfterCheckIn(f, prev) && !isAfterCheckIn(f, cur));
      if (between.length === 0) continue;
      const expected = roundMoney(prev.balance + between.reduce((s, f) => s + f.delta, 0));
      reconciliation[cur.id] = { expected, gap: roundMoney(cur.balance - expected), entries: between.length };
    }

    return {
      account,
      balance,
      signed: balance === null ? 0 : liability ? -balance : balance,
      lastUpdated: latest?.date ?? null,
      daysSinceUpdate: latest ? daysBetween(latest.date, today) : null,
      checkInBalance: latest?.balance ?? null,
      pending: est?.pending ?? [],
      estimated: (est?.pending.length ?? 0) > 0,
      change: latest && prior ? roundMoney(latest.balance - prior.balance) : null,
      growth,
      contributed: roundMoney(contributed),
      history,
      reconciliation,
    };
  });
}

// ─── Cash flow (from the budget) ────────────────────────────────────────────

export interface CashFlowMonth {
  month: Month;
  /** Budget income for the month (logged salary or the manual figure). */
  income: number;
  /** Logged income not assigned to a budget month — refunds, gifts, side money. */
  otherIncome: number;
  needs: number;
  wants: number;
  /** Needs + Wants — budget spending. */
  spending: number;
  /** Logged off-budget spending (e.g. a holiday paid from savings). */
  offBudget: number;
  /** Savings-category activity, as counted everywhere else in the app. */
  saved: number;
  totalIn: number;
  totalOut: number;
  /** totalIn − totalOut: what was left to save, invest or repay debt. */
  net: number;
  /** net / totalIn; null when nothing came in. */
  savingsRate: number | null;
  hasData: boolean;
}

/**
 * Money in vs out per month. Budget figures come from the engine; logged
 * off-budget spending and unassigned income are added by date. Transfers
 * are deliberately absent — moving your own money isn't in or out.
 */
export function cashFlowSeries(
  state: BudgetState,
  fromMonth: Month,
  toMonth: Month,
  movements: Movement[] = [],
): CashFlowMonth[] {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);
  const other = new Map<Month, number>();
  const off = new Map<Month, number>();
  for (const mv of movements) {
    if (!(mv.amount > 0)) continue;
    const m = mv.date.slice(0, 7);
    if (mv.type === "expense") off.set(m, (off.get(m) ?? 0) + mv.amount);
    else if (mv.type === "income" && !mv.budgetMonth) other.set(m, (other.get(m) ?? 0) + mv.amount);
  }
  const cache = createMonthCache();
  return monthsBetween(fromMonth, toMonth).map((m) => {
    const ms = computeMonth(state, m, cache);
    let needs = 0;
    let wants = 0;
    for (const r of ms.categories) {
      const g = byId.get(r.categoryId)?.group;
      if (g === "Needs") needs += r.spent;
      else if (g === "Wants") wants += r.spent;
    }
    needs = roundMoney(needs);
    wants = roundMoney(wants);
    const spending = roundMoney(needs + wants);
    const income = roundMoney(ms.income);
    const otherIncome = roundMoney(other.get(m) ?? 0);
    const offBudget = roundMoney(off.get(m) ?? 0);
    const totalIn = roundMoney(income + otherIncome);
    const totalOut = roundMoney(spending + offBudget);
    const net = roundMoney(totalIn - totalOut);
    return {
      month: m,
      income,
      otherIncome,
      needs,
      wants,
      spending,
      offBudget,
      saved: savingsThisMonth(state, ms),
      totalIn,
      totalOut,
      net,
      savingsRate: totalIn > 0 ? net / totalIn : null,
      hasData: totalIn > 0 || totalOut > 0,
    };
  });
}

export interface CashFlowAverages {
  months: Month[];
  /** All money in. */
  income: number;
  /** All money out, budget and off-budget. */
  spending: number;
  /** Needs + Wants only — for like-for-like comparison with a month in progress. */
  budgetSpending: number;
  needs: number;
  net: number;
  savingsRate: number | null;
}

/**
 * Averages over up to `n` months that have data, ending the month *before*
 * `month` — the selected month is usually still in progress and would
 * understate spending. Falls back to the selected month alone when there's
 * no history yet.
 */
export function trailingAverages(
  state: BudgetState,
  month: Month,
  n = 3,
  movements: Movement[] = [],
): CashFlowAverages {
  const series = cashFlowSeries(state, addMonths(month, -n), addMonths(month, -1), movements).filter((m) => m.hasData);
  const pool = series.length > 0 ? series : cashFlowSeries(state, month, month, movements).filter((m) => m.hasData);
  if (pool.length === 0) {
    return { months: [], income: 0, spending: 0, budgetSpending: 0, needs: 0, net: 0, savingsRate: null };
  }
  const avg = (f: (m: CashFlowMonth) => number) => roundMoney(pool.reduce((s, m) => s + f(m), 0) / pool.length);
  const income = avg((m) => m.totalIn);
  const spending = avg((m) => m.totalOut);
  const net = roundMoney(income - spending);
  return {
    months: pool.map((m) => m.month),
    income,
    spending,
    budgetSpending: avg((m) => m.spending),
    needs: avg((m) => m.needs),
    net,
    savingsRate: income > 0 ? net / income : null,
  };
}

// ─── Debt payoff ────────────────────────────────────────────────────────────

export interface PayoffProjection {
  /** null when the payment never clears the balance (it doesn't cover interest). */
  months: number | null;
  totalInterest: number | null;
  monthlyInterest: number;
}

export function projectPayoff(balance: number, aprPct: number, payment: number): PayoffProjection {
  const r = Math.max(0, aprPct) / 100 / 12;
  const monthlyInterest = roundMoney(balance * r);
  if (balance <= 0) return { months: 0, totalInterest: 0, monthlyInterest: 0 };
  if (payment <= 0 || payment <= balance * r) return { months: null, totalInterest: null, monthlyInterest };
  const months = r === 0 ? Math.ceil(balance / payment) : Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
  // Simulate for the interest total — the closed form is fiddly with a short final month.
  let b = balance;
  let interest = 0;
  for (let i = 0; i < months && b > 0; i++) {
    const charge = b * r;
    interest += charge;
    b = b + charge - payment;
  }
  return { months, totalInterest: roundMoney(interest), monthlyInterest };
}

// ─── Health metrics & flags ─────────────────────────────────────────────────

export type MetricStatus = "good" | "ok" | "warn" | "bad" | "neutral" | "na";

export interface HealthMetric {
  id: string;
  label: string;
  value: string;
  status: MetricStatus;
  /** 0–1 progress toward the target, for meters. */
  progress: number | null;
  target: string;
  detail: string;
}

export type FlagSeverity = "critical" | "warning" | "info" | "win";

export interface HealthFlag {
  id: string;
  severity: FlagSeverity;
  title: string;
  detail: string;
}

export interface HealthInput {
  wealth: WealthState;
  budget: BudgetState;
  month: Month;
  today: IsoDate;
}

export interface HealthReport {
  metrics: HealthMetric[];
  flags: HealthFlag[];
  /** 0–100 composite of the scorable metrics, or null when nothing can be scored yet. */
  score: number | null;
  averages: CashFlowAverages;
  current: NetWorthPoint;
  emergencyFund: number;
  monthlyEssentials: number;
}

const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const fmt = (n: number) => (n < 0 ? "−" : "") + gbp0.format(Math.abs(Math.round(n)));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Rough "retirement savings by age" multiples of gross salary, after the
 * widely quoted Fidelity guideline. A conversation starter, not advice.
 */
export function retirementMultipleForAge(age: number): number {
  const table: [number, number][] = [
    [25, 0.5], [30, 1], [35, 2], [40, 3], [45, 4], [50, 6], [55, 7], [60, 8], [67, 10],
  ];
  if (age <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [a1, m1] = table[i]!;
    const [a0, m0] = table[i - 1]!;
    if (age <= a1) return m0 + ((m1 - m0) * (age - a0)) / (a1 - a0);
  }
  return table[table.length - 1]![1];
}

const STATUS_POINTS: Record<MetricStatus, number | null> = {
  good: 100, ok: 70, warn: 40, bad: 10, neutral: null, na: null,
};

export function healthReport({ wealth, budget, month, today }: HealthInput): HealthReport {
  // Never count future-dated entries: the current month is "as of today".
  const asOf = monthEnd(month) < today ? monthEnd(month) : today;
  const ledger = buildLedger(wealth, budget.transactions);
  const current = netWorthAt(wealth, asOf, ledger);
  const views = accountViews(wealth, asOf, today, budget.transactions).filter((v) => !v.account.archived);
  const averages = trailingAverages(budget, month, 3, wealth.movements);
  const thisMonth = cashFlowSeries(budget, month, month, wealth.movements)[0]!;
  const profile: FinancialProfile = wealth.profile;
  const metrics: HealthMetric[] = [];
  const flags: HealthFlag[] = [];
  const hasAccounts = views.some((v) => v.balance !== null);

  const sumBy = (pred: (v: AccountView) => boolean) =>
    roundMoney(views.filter((v) => v.balance !== null && pred(v)).reduce((s, v) => s + (v.balance ?? 0), 0));

  const cashTotal = sumBy((v) => KIND_META[v.account.kind].assetClass === "cash");
  const currentAccounts = sumBy((v) => v.account.kind === "current");
  const flagged = views.filter((v) => v.account.emergencyFund && v.balance !== null);
  const emergencyFund = flagged.length > 0 ? sumBy((v) => !!v.account.emergencyFund) : cashTotal;
  // Essentials = Needs spending. Without category history fall back to all spending.
  const monthlyEssentials = averages.needs > 0 ? averages.needs : averages.spending;
  const monthlySpending = averages.spending;

  // 1. Emergency fund
  const target = profile.emergencyMonthsTarget || 6;
  if (hasAccounts && monthlyEssentials > 0) {
    const months = emergencyFund / monthlyEssentials;
    metrics.push({
      id: "emergency",
      label: "Emergency fund",
      value: `${months >= 10 ? Math.round(months) : months.toFixed(1)} mo`,
      status: months >= target ? "good" : months >= 3 ? "ok" : months >= 1 ? "warn" : "bad",
      progress: Math.min(1, months / target),
      target: `${target} months of essentials`,
      detail: `${fmt(emergencyFund)} ${flagged.length > 0 ? "in emergency-fund accounts" : "in cash"} covers ${fmt(monthlyEssentials)}/mo of essential spending.`,
    });
    if (months < 1) {
      flags.push({
        id: "emergency-low",
        severity: "critical",
        title: "Less than a month of safety net",
        detail: `One unexpected bill could push you into debt. Build ${fmt(monthlyEssentials * Math.min(3, target))} (3 months of essentials) before investing more.`,
      });
    } else if (months < 3) {
      flags.push({
        id: "emergency-thin",
        severity: "warning",
        title: "Emergency fund is thin",
        detail: `${months.toFixed(1)} months covered. Aim for at least 3, ideally ${target}. ${fmt(Math.max(0, monthlyEssentials * 3 - emergencyFund))} gets you to 3.`,
      });
    } else if (months > Math.max(12, target * 2) && monthlySpending > 0) {
      const excess = emergencyFund - monthlyEssentials * target;
      flags.push({
        id: "cash-drag",
        severity: "info",
        title: "Cash may be working too little",
        detail: `You hold ${Math.round(months)} months of essentials in cash. Roughly ${fmt(excess)} above your ${target}-month target could go toward investments, a pension or debt — inflation erodes idle cash.`,
      });
    }
  } else {
    metrics.push({
      id: "emergency",
      label: "Emergency fund",
      value: "—",
      status: "na",
      progress: null,
      target: `${target} months of essentials`,
      detail: hasAccounts ? "Log a month of Needs spending to measure coverage." : "Add your cash accounts to measure coverage.",
    });
  }

  // 2. Savings rate
  if (averages.savingsRate !== null) {
    const r = averages.savingsRate;
    metrics.push({
      id: "savings-rate",
      label: "Savings rate",
      value: pct(r),
      status: r >= 0.2 ? "good" : r >= 0.1 ? "ok" : r >= 0 ? "warn" : "bad",
      progress: Math.max(0, Math.min(1, r / 0.2)),
      target: "20% or more of income",
      detail: `Income left after all spending (budget and off-budget), averaged over ${averages.months.length} month${averages.months.length === 1 ? "" : "s"}.`,
    });
    if (r < 0) {
      flags.push({
        id: "spending-exceeds-income",
        severity: "critical",
        title: "Spending more than you earn",
        detail: `On average you spend ${fmt(averages.spending)} against ${fmt(averages.income)} of income — a ${fmt(-averages.net)}/mo shortfall funded by savings or credit.`,
      });
    } else if (r < 0.1) {
      flags.push({
        id: "low-savings-rate",
        severity: "warning",
        title: "Low savings rate",
        detail: `Only ${pct(r)} of income is left after spending. Getting to 10% means freeing up ${fmt(averages.income * 0.1 - averages.net)}/mo.`,
      });
    } else if (r >= 0.2) {
      flags.push({
        id: "savings-rate-win",
        severity: "win",
        title: `Saving ${pct(r)} of your income`,
        detail: "Above the 20% benchmark. Keep it up — this is the biggest driver of long-term wealth.",
      });
    }
  } else {
    metrics.push({
      id: "savings-rate",
      label: "Savings rate",
      value: "—",
      status: "na",
      progress: null,
      target: "20% or more of income",
      detail: "Set monthly income on Home to measure this.",
    });
  }

  // 3. Spending running hot (this month vs. trailing average)
  // Budget spending vs budget spending: off-budget one-offs would make every month look "hot".
  if (
    averages.budgetSpending > 0 &&
    thisMonth.spending > averages.budgetSpending * 1.2 &&
    averages.months[0] !== month
  ) {
    flags.push({
      id: "spending-spike",
      severity: "warning",
      title: "Spending is running hot",
      detail: `${fmt(thisMonth.spending)} of budget spending so far this month, ${pct(thisMonth.spending / averages.budgetSpending - 1)} above your recent ${fmt(averages.budgetSpending)} average.`,
    });
  }

  // 4. Debt-to-income (monthly repayments vs. income)
  // Cards paid in full are spending on a short delay, not borrowing: they still
  // count toward net worth and utilisation, but not debt-to-income or debt flags.
  const debts = views.filter((v) => carriesBalance(v.account) && (v.balance ?? 0) > 0);
  const debtPayments = roundMoney(debts.reduce((s, v) => s + (v.account.monthlyPayment ?? 0), 0));
  const grossMonthly = profile.grossAnnualIncome ? profile.grossAnnualIncome / 12 : 0;
  const incomeBase = grossMonthly > 0 ? grossMonthly : averages.income;
  if (debts.length === 0 && hasAccounts) {
    metrics.push({
      id: "dti",
      label: "Debt-to-income",
      value: "0%",
      status: "good",
      progress: 0,
      target: "Under 20% of income",
      detail: views.some((v) => v.account.paysInFull && (v.balance ?? 0) > 0)
        ? "No debt carried month to month — cards cleared in full don't count."
        : "No outstanding debts recorded.",
    });
  } else if (debtPayments > 0 && incomeBase > 0) {
    const dti = debtPayments / incomeBase;
    metrics.push({
      id: "dti",
      label: "Debt-to-income",
      value: pct(dti),
      status: dti < 0.2 ? "good" : dti < 0.36 ? "ok" : dti < 0.43 ? "warn" : "bad",
      progress: Math.min(1, dti / 0.43),
      target: "Under 20% of income",
      detail: `${fmt(debtPayments)}/mo of repayments against ${fmt(incomeBase)} ${grossMonthly > 0 ? "gross" : "net"} monthly income.`,
    });
    if (dti >= 0.36) {
      flags.push({
        id: "dti-high",
        severity: dti >= 0.43 ? "critical" : "warning",
        title: "Debt repayments are eating your income",
        detail: `${pct(dti)} of income goes to debt. Lenders get nervous above 36%, and it leaves little room for shocks.`,
      });
    }
  } else {
    metrics.push({
      id: "dti",
      label: "Debt-to-income",
      value: "—",
      status: "na",
      progress: null,
      target: "Under 20% of income",
      detail: debts.length > 0 ? "Add monthly repayments to your debts to measure this." : "Add accounts to measure this.",
    });
  }

  // 5. Credit utilisation
  const cards = views.filter((v) => v.account.kind === "creditCard" && (v.account.creditLimit ?? 0) > 0);
  if (cards.length > 0) {
    const owed = cards.reduce((s, v) => s + Math.max(0, v.balance ?? 0), 0);
    const limit = cards.reduce((s, v) => s + (v.account.creditLimit ?? 0), 0);
    const u = owed / limit;
    metrics.push({
      id: "utilisation",
      label: "Credit utilisation",
      value: pct(u),
      status: u < 0.1 ? "good" : u < 0.3 ? "ok" : u < 0.5 ? "warn" : "bad",
      progress: Math.min(1, u),
      target: "Under 30% of limits",
      detail: `${fmt(owed)} used of ${fmt(limit)} available credit.`,
    });
    if (u >= 0.5) {
      flags.push({
        id: "utilisation-high",
        severity: u >= 0.75 ? "critical" : "warning",
        title: "High credit card utilisation",
        detail: `${pct(u)} of your limits are used. Above 30% tends to hurt your credit score; above 75% signals stress to lenders.`,
      });
    }
    for (const c of cards) {
      if ((c.balance ?? 0) > (c.account.creditLimit ?? Infinity)) {
        flags.push({
          id: `over-limit-${c.account.id}`,
          severity: "critical",
          title: `${c.account.name} is over its limit`,
          detail: "Over-limit fees and credit-score damage are likely. Bring it under the limit first.",
        });
      }
    }
  }

  // 6. High-interest debt, especially while holding spare cash
  const pricey = debts.filter((v) => KIND_META[v.account.kind].consumerDebt && (v.account.rate ?? 0) >= 10);
  if (pricey.length > 0) {
    const owed = roundMoney(pricey.reduce((s, v) => s + (v.balance ?? 0), 0));
    const worst = pricey.reduce((a, b) => ((b.account.rate ?? 0) > (a.account.rate ?? 0) ? b : a));
    const yearlyCost = pricey.reduce((s, v) => s + (v.balance ?? 0) * ((v.account.rate ?? 0) / 100), 0);
    const spareCash = Math.max(0, cashTotal - monthlyEssentials * 3);
    const canClear = monthlyEssentials > 0 && spareCash > 0;
    flags.push({
      id: "high-interest-debt",
      severity: "warning",
      title: `${fmt(owed)} of high-interest debt`,
      detail: canClear
        ? `Costs about ${fmt(yearlyCost)} a year (up to ${worst.account.rate}% APR) while ${fmt(spareCash)} of cash sits beyond a 3-month buffer. Clearing it is a guaranteed ${worst.account.rate}% return.`
        : `Costs about ${fmt(yearlyCost)} a year in interest (up to ${worst.account.rate}% APR on ${worst.account.name}). Prioritise it above investing.`,
    });
  }
  for (const d of debts) {
    const rate = d.account.rate ?? 0;
    const pay = d.account.monthlyPayment ?? 0;
    if (pay > 0 && rate > 0 && d.account.kind !== "studentLoan") {
      const p = projectPayoff(d.balance ?? 0, rate, pay);
      if (p.months === null) {
        flags.push({
          id: `never-clears-${d.account.id}`,
          severity: "critical",
          title: `${d.account.name} will never be paid off`,
          detail: `${fmt(pay)}/mo doesn't cover the ${fmt(p.monthlyInterest)}/mo interest. The balance will grow.`,
        });
      }
    }
  }

  // 7. Net worth trend
  const series = netWorthSeries(wealth, addMonths(month, -12), month, budget.transactions, today).filter(
    (p) => p.hasData,
  );
  if (series.length >= 2) {
    const first = series[0]!;
    const last = series[series.length - 1]!;
    const delta = roundMoney(last.netWorth - first.netWorth);
    const base = Math.abs(first.netWorth);
    metrics.push({
      id: "nw-trend",
      label: series.length >= 13 ? "Net worth, 12 mo" : `Net worth, ${series.length - 1} mo`,
      value: (delta >= 0 ? "+" : "−") + gbp0.format(Math.abs(delta)),
      status: delta > 0 ? "good" : delta === 0 ? "ok" : "bad",
      progress: null,
      target: "Growing over time",
      detail: base > 0 ? `${delta >= 0 ? "Up" : "Down"} ${pct(Math.abs(delta) / base)} since ${first.month}.` : `Since ${first.month}.`,
    });
    const tail = series.slice(-4);
    if (tail.length === 4 && tail.every((p, i) => i === 0 || p.netWorth < tail[i - 1]!.netWorth)) {
      flags.push({
        id: "nw-falling",
        severity: "warning",
        title: "Net worth has fallen 3 months running",
        detail: `Down ${fmt(tail[0]!.netWorth - tail[3]!.netWorth)} since ${tail[0]!.month}. Check whether it's markets or spending.`,
      });
    }
    const peak = Math.max(...series.slice(0, -1).map((p) => p.netWorth));
    if (last.netWorth > peak && delta > 0) {
      flags.push({
        id: "nw-high",
        severity: "win",
        title: "Net worth at an all-time high",
        detail: `${fmt(last.netWorth)} — the highest since you started tracking.`,
      });
    }
  }

  // 8. Retirement benchmark (needs age + salary)
  const retirement = sumBy((v) => v.account.kind === "pension" || v.account.kind === "investment");
  if (profile.birthYear && profile.grossAnnualIncome && hasAccounts) {
    const age = Number(today.slice(0, 4)) - profile.birthYear;
    const multiple = retirementMultipleForAge(age);
    const benchmark = profile.grossAnnualIncome * multiple;
    const ratio = benchmark > 0 ? retirement / benchmark : 0;
    metrics.push({
      id: "retirement",
      label: "Retirement on track",
      value: pct(ratio),
      status: ratio >= 1 ? "good" : ratio >= 0.75 ? "ok" : ratio >= 0.4 ? "warn" : "bad",
      progress: Math.min(1, ratio),
      target: `${multiple.toFixed(1).replace(/\.0$/, "")}× salary by ${age}`,
      detail: `${fmt(retirement)} in pensions + investments vs a ${fmt(benchmark)} rule-of-thumb for your age.`,
    });
    if (ratio < 0.4 && age >= 30) {
      flags.push({
        id: "retirement-behind",
        severity: "warning",
        title: "Retirement savings are behind",
        detail: "Check you're getting your full employer pension match — it's free money — and consider raising contributions with each pay rise.",
      });
    }
  }

  // 9. Financial independence progress (4% rule)
  if (monthlySpending > 0 && hasAccounts) {
    const invested = retirement;
    const fiNumber = monthlySpending * 12 * 25;
    metrics.push({
      id: "fi",
      label: "Financial independence",
      value: pct(invested / fiNumber),
      status: "neutral",
      progress: Math.min(1, invested / fiNumber),
      target: `${fmt(fiNumber)} (25× spending)`,
      detail: "Invested assets vs the pot that could fund your current lifestyle indefinitely.",
    });
  }

  // 10. Idle money in current accounts
  if (monthlySpending > 0 && currentAccounts > monthlySpending * 2 && currentAccounts - monthlySpending > 1000) {
    flags.push({
      id: "idle-current",
      severity: "info",
      title: "Money idle in current accounts",
      detail: `${fmt(currentAccounts)} in current accounts is over 2 months of spending. Moving ${fmt(currentAccounts - monthlySpending * 1.2)} to savings would earn interest.`,
    });
  }

  // 11. Concentration
  const crypto = sumBy((v) => v.account.kind === "crypto");
  if (current.netWorth > 0 && crypto / current.netWorth > 0.1) {
    flags.push({
      id: "crypto-heavy",
      severity: "warning",
      title: "Crypto is a large slice of your wealth",
      detail: `${pct(crypto / current.netWorth)} of net worth. Volatile assets above ~10% can swing your position dramatically.`,
    });
  }

  // 12. Stale balances — only nag when looking at the present, not history.
  if (monthEnd(month) >= today) {
    const stale = views.filter(
      (v) => v.daysSinceUpdate !== null && v.daysSinceUpdate > 35 && !(v.balance === 0 && v.account.kind !== "current"),
    );
    if (stale.length > 0) {
      flags.push({
        id: "stale",
        severity: "info",
        title: `${stale.length} balance${stale.length === 1 ? "" : "s"} out of date`,
        detail: `${stale.slice(0, 3).map((v) => v.account.name).join(", ")}${stale.length > 3 ? "…" : ""} not updated in over a month. A monthly check-in keeps these numbers honest.`,
      });
    }
  }

  // 13. Consumer debt outweighing cash
  if (hasAccounts) {
    const consumer = roundMoney(debts.filter((v) => KIND_META[v.account.kind].consumerDebt).reduce((s, v) => s + (v.balance ?? 0), 0));
    if (consumer > 0 && consumer > cashTotal && averages.income > 0 && consumer > averages.income) {
      flags.push({
        id: "consumer-debt-heavy",
        severity: "warning",
        title: "Consumer debt exceeds your cash",
        detail: `${fmt(consumer)} on cards, loans and overdrafts vs ${fmt(cashTotal)} cash — more than a month's income.`,
      });
    }
  }

  const order: Record<FlagSeverity, number> = { critical: 0, warning: 1, info: 2, win: 3 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);

  const scored = metrics.map((m) => STATUS_POINTS[m.status]).filter((p): p is number => p !== null);
  const score = scored.length >= 2 ? Math.round(scored.reduce((s, p) => s + p, 0) / scored.length) : null;

  return { metrics, flags, score, averages, current, emergencyFund, monthlyEssentials };
}
