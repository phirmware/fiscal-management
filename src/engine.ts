import type {
  BudgetState,
  Category,
  CategoryMonthResult,
  CategoryType,
  Month,
  MonthSummary,
  RangeMonthSummary,
  SavingsSummary,
  TypeSegment,
} from "./types.js";

export function prevMonth(month: Month): Month {
  const [y, m] = parseMonth(month);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${pad2(m - 1)}`;
}

export function nextMonth(month: Month): Month {
  const [y, m] = parseMonth(month);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${pad2(m + 1)}`;
}

export function monthFromDate(date: string): Month {
  return date.slice(0, 7);
}

function parseMonth(month: Month): [number, number] {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Invalid month "${month}", expected "YYYY-MM"`);
  }
  return [y, m];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function activeSegment(category: Category, month: Month): TypeSegment {
  const segs = category.typeSegments;
  if (segs.length === 0) {
    throw new Error(`Category "${category.id}" has no type segments`);
  }
  let active = segs[0]!;
  for (const seg of segs) {
    if (seg.fromMonth <= month) active = seg;
    else break;
  }
  return active;
}

export function resolveType(category: Category, month: Month): CategoryType {
  return activeSegment(category, month).type;
}

function sumBudgeted(state: BudgetState, categoryId: string, month: Month): number {
  let total = 0;
  for (const b of state.budgets) {
    if (b.categoryId === categoryId && b.month === month) total += b.amount;
  }
  return total;
}

function sumSpent(state: BudgetState, categoryId: string, month: Month): number {
  let total = 0;
  for (const t of state.transactions) {
    if (t.categoryId === categoryId && monthFromDate(t.date) === month) {
      total += t.amount;
    }
  }
  return total;
}

type CategoryMonthCache = Map<string, CategoryMonthResult>;

function cacheKey(categoryId: string, month: Month): string {
  return `${categoryId}|${month}`;
}

export function computeCategoryMonth(
  state: BudgetState,
  categoryId: string,
  month: Month,
  cache: CategoryMonthCache = new Map(),
): CategoryMonthResult {
  const key = cacheKey(categoryId, month);
  const hit = cache.get(key);
  if (hit) return hit;

  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) throw new Error(`Unknown category "${categoryId}"`);

  const seg = activeSegment(category, month);
  const type = seg.type;
  const budgeted = sumBudgeted(state, categoryId, month);
  const spent = sumSpent(state, categoryId, month);

  let carryIn = 0;
  if (type === "Pot" && month > seg.fromMonth) {
    const prev = prevMonth(month);
    const prevResult = computeCategoryMonth(state, categoryId, prev, cache);
    carryIn = prevResult.available;
  }

  const available = type === "Pot" ? carryIn + budgeted - spent : budgeted - spent;

  const result: CategoryMonthResult = {
    categoryId,
    type,
    budgeted,
    spent,
    carryIn,
    available,
  };
  cache.set(key, result);
  return result;
}

function categoryExistsAt(category: Category, month: Month): boolean {
  const first = category.typeSegments[0];
  if (!first) return false;
  return first.fromMonth <= month;
}

function incomeFor(state: BudgetState, month: Month): { income: number; incomeSet: boolean } {
  const entry = state.income.find((i) => i.month === month);
  if (!entry) return { income: 0, incomeSet: false };
  return { income: entry.netAmount, incomeSet: true };
}

function releasedFromConversionsFor(
  state: BudgetState,
  month: Month,
  cache: CategoryMonthCache,
): number {
  let released = 0;
  for (const category of state.categories) {
    const segs = category.typeSegments;
    for (let i = 1; i < segs.length; i++) {
      const cur = segs[i]!;
      const prevSeg = segs[i - 1]!;
      if (cur.fromMonth === month && prevSeg.type === "Pot" && cur.type === "Limit") {
        const prev = prevMonth(month);
        const prevResult = computeCategoryMonth(state, category.id, prev, cache);
        released += prevResult.available;
      }
    }
  }
  return released;
}

export function computeMonth(state: BudgetState, month: Month): MonthSummary {
  const cache: CategoryMonthCache = new Map();
  const { income, incomeSet } = incomeFor(state, month);

  const categories: CategoryMonthResult[] = [];
  for (const category of state.categories) {
    if (category.archived) continue;
    if (!categoryExistsAt(category, month)) continue;
    categories.push(computeCategoryMonth(state, category.id, month, cache));
  }

  let totalBudgeted = 0;
  let totalSpent = 0;
  for (const c of categories) {
    totalBudgeted += c.budgeted;
    totalSpent += c.spent;
  }

  const unallocated = income - totalBudgeted;
  const releasedFromConversions = releasedFromConversionsFor(state, month, cache);

  return {
    month,
    income,
    incomeSet,
    totalBudgeted,
    totalSpent,
    unallocated,
    categories,
    releasedFromConversions,
  };
}

export function computeSavings(state: BudgetState, month: Month): SavingsSummary {
  let monthTotal = 0;
  for (const e of state.savingsEntries) {
    if (e.month === month) monthTotal += e.amount;
  }

  const cumulativeByAccount: Record<string, number> = {};
  for (const acc of state.savingsAccounts) {
    let total = acc.startingBalance;
    for (const e of state.savingsEntries) {
      if (e.accountId === acc.id && e.month <= month) total += e.amount;
    }
    cumulativeByAccount[acc.id] = total;
  }

  let cumulativeTotal = 0;
  for (const v of Object.values(cumulativeByAccount)) cumulativeTotal += v;

  return { monthTotal, cumulativeByAccount, cumulativeTotal };
}

export function computeRange(
  state: BudgetState,
  fromMonth: Month,
  toMonth: Month,
): RangeMonthSummary[] {
  if (fromMonth > toMonth) return [];
  const results: RangeMonthSummary[] = [];
  let m = fromMonth;
  while (m <= toMonth) {
    const summary = computeMonth(state, m);
    const savings = computeSavings(state, m);
    results.push({ ...summary, savings });
    if (m === toMonth) break;
    m = nextMonth(m);
  }
  return results;
}
