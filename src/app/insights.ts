import { computeMonth, computeSavings } from "../engine.js";
import type {
  BudgetState,
  Category,
  Group,
  Month,
  MonthSummary,
  SavingsSummary,
} from "../types.js";
import { isAcked } from "./state.js";
import type { ReleaseAck } from "./state.js";
import { monthsBetween, nextMonth, prevMonth } from "./utils/month.js";

export interface SavingsTrendPoint {
  month: Month;
  monthTotal: number;
  cumulativeTotal: number;
}

export function savingsTrend(state: BudgetState, fromMonth: Month, toMonth: Month): SavingsTrendPoint[] {
  const months = monthsBetween(fromMonth, toMonth);
  return months.map((m) => {
    const s = computeSavings(state, m);
    return { month: m, monthTotal: s.monthTotal, cumulativeTotal: s.cumulativeTotal };
  });
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
  Needs: "#0284c7",
  Wants: "#9333ea",
  Savings: "#059669",
};

/**
 * 3-column flow: Income (col 0) → Groups (col 1) → Categories (col 2) +
 * a Savings node beside the Savings group. The unspent remainder per category
 * is folded into a single "Not yet assigned" node so totals balance to income.
 */
export function buildFlow(
  state: BudgetState,
  monthSummary: MonthSummary,
  savingsSummary: SavingsSummary,
): FlowGraph {
  const byId = new Map<string, Category>();
  for (const c of state.categories) byId.set(c.id, c);

  const totalIncome = monthSummary.income;
  const groupSpend: Record<Group, number> = { Needs: 0, Wants: 0, Savings: 0 };
  const categorySpend: { id: string; name: string; group: Group; spent: number }[] = [];

  for (const r of monthSummary.categories) {
    const cat = byId.get(r.categoryId);
    if (!cat) continue;
    groupSpend[cat.group] += r.spent;
    if (r.spent > 0) {
      categorySpend.push({ id: r.categoryId, name: cat.name, group: cat.group, spent: r.spent });
    }
  }

  // Savings entries flow into the Savings group total.
  groupSpend.Savings += savingsSummary.monthTotal;

  const allocated = groupSpend.Needs + groupSpend.Wants + groupSpend.Savings;
  const notYetAssigned = Math.max(0, totalIncome - allocated);

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  nodes.push({ id: "income", label: "Income", amount: totalIncome, colour: "#0f1115", column: 0 });

  for (const g of ["Needs", "Wants", "Savings"] as const) {
    if (groupSpend[g] <= 0) continue;
    const id = `group:${g}`;
    nodes.push({ id, label: g, amount: groupSpend[g], colour: GROUP_COLOURS[g], column: 1, group: g });
    links.push({ from: "income", to: id, amount: groupSpend[g] });
  }

  if (notYetAssigned > 0) {
    nodes.push({
      id: "unassigned",
      label: "Not yet assigned",
      amount: notYetAssigned,
      colour: "#6a7079",
      column: 1,
    });
    links.push({ from: "income", to: "unassigned", amount: notYetAssigned });
  }

  for (const c of categorySpend) {
    const id = `cat:${c.id}`;
    nodes.push({ id, label: c.name, amount: c.spent, colour: GROUP_COLOURS[c.group], column: 2, group: c.group });
    links.push({ from: `group:${c.group}`, to: id, amount: c.spent });
  }

  if (savingsSummary.monthTotal > 0) {
    nodes.push({
      id: "savings:total",
      label: "Savings accounts",
      amount: savingsSummary.monthTotal,
      colour: GROUP_COLOURS.Savings,
      column: 2,
      group: "Savings",
    });
    links.push({ from: "group:Savings", to: "savings:total", amount: savingsSummary.monthTotal });
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
  for (const cat of state.categories) {
    const segs = cat.typeSegments;
    for (let i = 1; i < segs.length; i++) {
      const cur = segs[i]!;
      const prev = segs[i - 1]!;
      if (cur.fromMonth !== month) continue;
      if (prev.type !== "Pot" || cur.type !== "Limit") continue;
      const prevMonthSummary = computeMonth(state, prevMonth(month));
      const priorCat = prevMonthSummary.categories.find((c) => c.categoryId === cat.id);
      if (!priorCat) continue;
      out.push({
        categoryId: cat.id,
        categoryName: cat.name,
        month,
        amount: priorCat.available,
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
  let totalIncome = 0;
  let totalBudgeted = 0;
  let totalSpent = 0;
  let totalSaved = 0;
  for (const m of months) {
    const ms = computeMonth(state, m);
    totalIncome += ms.income;
    totalBudgeted += ms.totalBudgeted;
    totalSpent += ms.totalSpent;
    totalSaved += computeSavings(state, m).monthTotal;
  }
  return {
    fromMonth,
    toMonth,
    totalIncome,
    totalBudgeted,
    totalSpent,
    totalSaved,
    monthCount: months.length,
  };
}

export { nextMonth, prevMonth };
