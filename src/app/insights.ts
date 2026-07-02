import { computeMonth, createMonthCache } from "../engine.js";
import type {
  BudgetState,
  Category,
  Group,
  Month,
  MonthSummary,
} from "../types.js";
import { earliestSavingsMonth, savingsThisMonth } from "./derived.js";
import { isAcked } from "./state.js";
import type { ReleaseAck } from "./state.js";
import { roundMoney } from "./utils/money.js";
import { monthsBetween, nextMonth, prevMonth } from "./utils/month.js";

export interface SavingsTrendPoint {
  month: Month;
  monthTotal: number;
  cumulativeTotal: number;
}

/**
 * Savings per month plus a running cumulative total, in one forward pass.
 * Walks from the earliest savings-relevant month (so the cumulative line is
 * correct even when the visible range starts later) and shares a single
 * engine cache — O(months) instead of the naive O(months²).
 */
export function savingsTrend(state: BudgetState, fromMonth: Month, toMonth: Month): SavingsTrendPoint[] {
  const months = monthsBetween(fromMonth, toMonth);
  if (months.length === 0) return [];

  const cache = createMonthCache();
  const earliest = earliestSavingsMonth(state);
  const walkFrom = earliest && earliest < fromMonth ? earliest : fromMonth;

  const points: SavingsTrendPoint[] = [];
  let running = 0;
  let m: Month = walkFrom;
  while (m <= toMonth) {
    const monthTotal = earliest && m >= earliest
      ? savingsThisMonth(state, computeMonth(state, m, cache))
      : 0;
    running = roundMoney(running + monthTotal);
    if (m >= fromMonth) {
      points.push({ month: m, monthTotal, cumulativeTotal: running });
    }
    if (m === toMonth) break;
    m = nextMonth(m);
  }
  return points;
}

export interface FlowNode {
  id: string;
  label: string;
  amount: number;
  colour: string;
  column: 0 | 1 | 2;
  group?: Group;
}

export interface FlowLink {
  from: string;
  to: string;
  amount: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
  totalIncome: number;
}

const GROUP_COLOURS: Record<Group, string> = {
  Needs: "rgb(var(--c-group-needs))",
  Wants: "rgb(var(--c-group-wants))",
  Savings: "rgb(var(--c-group-savings))",
};

const INCOME_COLOUR = "rgb(var(--c-ink))";
const UNASSIGNED_COLOUR = "rgb(var(--c-ink-muted))";

/**
 * 3-column flow: Income (col 0) → Groups (col 1) → Categories (col 2).
 * Needs/Wants use spent amounts (actual consumption); Savings uses
 * (budgeted − spent) per category (net amount saved this month).
 * Anything not accounted for flows into a "Not yet assigned" node so
 * the columns balance to income.
 */
export function buildFlow(
  state: BudgetState,
  monthSummary: MonthSummary,
): FlowGraph {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);

  const totalIncome = monthSummary.income;
  const groupAmount: Record<Group, number> = { Needs: 0, Wants: 0, Savings: 0 };
  const categoryAmount: { id: string; name: string; group: Group; amount: number }[] = [];

  for (const r of monthSummary.categories) {
    const cat = byId.get(r.categoryId);
    if (!cat) continue;
    // Savings: max(budgeted, spent) — whichever way the user records it.
    // Needs/Wants: spent (actual consumption).
    const value =
      cat.group === "Savings" ? Math.max(r.budgeted, r.spent) : Math.max(0, r.spent);
    groupAmount[cat.group] += value;
    if (value > 0) {
      categoryAmount.push({ id: r.categoryId, name: cat.name, group: cat.group, amount: value });
    }
  }

  const allocated = groupAmount.Needs + groupAmount.Wants + groupAmount.Savings;
  const notYetAssigned = roundMoney(Math.max(0, totalIncome - allocated));
  for (const g of ["Needs", "Wants", "Savings"] as const) {
    groupAmount[g] = roundMoney(groupAmount[g]);
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  nodes.push({ id: "income", label: "Income", amount: totalIncome, colour: INCOME_COLOUR, column: 0 });

  for (const g of ["Needs", "Wants", "Savings"] as const) {
    if (groupAmount[g] <= 0) continue;
    const id = `group:${g}`;
    nodes.push({ id, label: g, amount: groupAmount[g], colour: GROUP_COLOURS[g], column: 1, group: g });
    links.push({ from: "income", to: id, amount: groupAmount[g] });
  }

  if (notYetAssigned > 0) {
    nodes.push({
      id: "unassigned",
      label: "Not yet assigned",
      amount: notYetAssigned,
      colour: UNASSIGNED_COLOUR,
      column: 1,
    });
    links.push({ from: "income", to: "unassigned", amount: notYetAssigned });
  }

  for (const c of categoryAmount) {
    const id = `cat:${c.id}`;
    nodes.push({ id, label: c.name, amount: c.amount, colour: GROUP_COLOURS[c.group], column: 2, group: c.group });
    links.push({ from: `group:${c.group}`, to: id, amount: c.amount });
  }

  return { nodes, links, totalIncome };
}

export interface ReleaseEntry {
  categoryId: string;
  categoryName: string;
  month: Month;
  amount: number;
  acknowledged: boolean;
}

/**
 * Per-category release amounts for the given month, computed by replaying the
 * engine's conversion logic at the data level (we never touch the engine itself).
 * Released amount equals the prior-month available for any Pot→Limit conversion
 * effective at this month — exactly what the engine reports as
 * releasedFromConversions, but split out per category and labelled.
 */
export function releasesFor(state: BudgetState, month: Month, acks: ReleaseAck[]): ReleaseEntry[] {
  const out: ReleaseEntry[] = [];
  // Lazily computed once — most months have no conversions at all.
  let prevSummary: MonthSummary | null = null;
  for (const cat of state.categories) {
    const segs = cat.typeSegments;
    for (let i = 1; i < segs.length; i++) {
      const cur = segs[i]!;
      const prev = segs[i - 1]!;
      if (cur.fromMonth !== month) continue;
      if (prev.type !== "Pot" || cur.type !== "Limit") continue;
      prevSummary ??= computeMonth(state, prevMonth(month));
      const priorCat = prevSummary.categories.find((c) => c.categoryId === cat.id);
      if (!priorCat) continue;
      const amount = roundMoney(priorCat.available);
      // A pot that ended at exactly zero has nothing to release — surfacing a
      // "£0 released" prompt would be pure noise (and impossible to resolve
      // via "assign", which ignores zero amounts).
      if (amount === 0) continue;
      out.push({
        categoryId: cat.id,
        categoryName: cat.name,
        month,
        amount,
        acknowledged: isAcked(acks, cat.id, month),
      });
    }
  }
  return out;
}

export function unresolvedReleases(state: BudgetState, month: Month, acks: ReleaseAck[]): ReleaseEntry[] {
  return releasesFor(state, month, acks).filter((r) => !r.acknowledged);
}

export interface RangeSummary {
  fromMonth: Month;
  toMonth: Month;
  totalIncome: number;
  totalBudgeted: number;
  totalSpent: number;
  totalSaved: number;
  monthCount: number;
}

export function rangeSummary(state: BudgetState, fromMonth: Month, toMonth: Month): RangeSummary {
  const months = monthsBetween(fromMonth, toMonth);
  const cache = createMonthCache();
  let totalIncome = 0;
  let totalBudgeted = 0;
  let totalSpent = 0;
  let totalSaved = 0;
  for (const m of months) {
    const ms = computeMonth(state, m, cache);
    totalIncome += ms.income;
    totalBudgeted += ms.totalBudgeted;
    totalSpent += ms.totalSpent;
    totalSaved += savingsThisMonth(state, ms);
  }
  return {
    fromMonth,
    toMonth,
    totalIncome: roundMoney(totalIncome),
    totalBudgeted: roundMoney(totalBudgeted),
    totalSpent: roundMoney(totalSpent),
    totalSaved: roundMoney(totalSaved),
    monthCount: months.length,
  };
}

export { nextMonth, prevMonth };
