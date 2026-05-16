import { computeRange } from "./engine.js";
import type { BudgetState } from "./types.js";

const state: BudgetState = {
  categories: [
    {
      id: "groceries",
      name: "Groceries",
      group: "Needs",
      archived: false,
      typeSegments: [{ fromMonth: "2026-01", type: "Limit" }],
    },
    {
      id: "car",
      name: "Car maintenance",
      group: "Needs",
      archived: false,
      annualTarget: 1200,
      typeSegments: [{ fromMonth: "2026-01", type: "Pot" }],
    },
    {
      id: "eatout",
      name: "Eating out",
      group: "Wants",
      archived: false,
      typeSegments: [
        { fromMonth: "2026-01", type: "Pot" },
        { fromMonth: "2026-03", type: "Limit" },
      ],
    },
  ],
  budgets: [
    { categoryId: "groceries", month: "2026-01", amount: 400 },
    { categoryId: "groceries", month: "2026-02", amount: 400 },
    { categoryId: "groceries", month: "2026-03", amount: 400 },

    { categoryId: "car", month: "2026-01", amount: 100 },
    { categoryId: "car", month: "2026-02", amount: 100 },
    { categoryId: "car", month: "2026-03", amount: 100 },

    { categoryId: "eatout", month: "2026-01", amount: 80 },
    { categoryId: "eatout", month: "2026-02", amount: 80 },
    { categoryId: "eatout", month: "2026-03", amount: 80 },
  ],
  transactions: [
    { id: "g1", categoryId: "groceries", date: "2026-01-05", amount: 120 },
    { id: "g2", categoryId: "groceries", date: "2026-01-19", amount: 210 },
    { id: "g3", categoryId: "groceries", date: "2026-02-04", amount: 180 },
    { id: "g4", categoryId: "groceries", date: "2026-02-22", amount: 240 },
    { id: "g5", categoryId: "groceries", date: "2026-03-09", amount: 300 },

    { id: "c1", categoryId: "car", date: "2026-02-11", amount: 320 },

    { id: "e1", categoryId: "eatout", date: "2026-01-14", amount: 35 },
    { id: "e2", categoryId: "eatout", date: "2026-02-08", amount: 60 },
    { id: "e3", categoryId: "eatout", date: "2026-03-12", amount: 25 },
  ],
  savingsAccounts: [
    { id: "emergency", name: "Emergency fund", startingBalance: 1500 },
    { id: "holiday", name: "Holiday", startingBalance: 0 },
  ],
  savingsEntries: [
    { accountId: "emergency", month: "2026-01", amount: 200 },
    { accountId: "holiday", month: "2026-01", amount: 100 },
    { accountId: "emergency", month: "2026-02", amount: 200 },
    { accountId: "holiday", month: "2026-02", amount: 100 },
    { accountId: "holiday", month: "2026-03", amount: -50 },
    { accountId: "emergency", month: "2026-03", amount: 250 },
  ],
  income: [
    { month: "2026-01", netAmount: 2800 },
    { month: "2026-02", netAmount: 2800 },
    { month: "2026-03", netAmount: 2800 },
  ],
};

const nameById = new Map(state.categories.map((c) => [c.id, c.name]));

function fmt(n: number): string {
  const sign = n < 0 ? "-" : " ";
  return `${sign}£${Math.abs(n).toFixed(2).padStart(8, " ")}`;
}

const months = computeRange(state, "2026-01", "2026-03");

for (const m of months) {
  console.log("=".repeat(72));
  console.log(`Month ${m.month}`);
  console.log("-".repeat(72));
  console.log(
    `Income: ${fmt(m.income)}   Budgeted: ${fmt(m.totalBudgeted)}   ` +
      `Spent: ${fmt(m.totalSpent)}   Unallocated: ${fmt(m.unallocated)}`,
  );
  if (m.releasedFromConversions !== 0) {
    console.log(`Released from Pot→Limit conversions: ${fmt(m.releasedFromConversions)}`);
  }
  console.log("");
  console.log(
    `  ${"Category".padEnd(20)} ${"Type".padEnd(6)} ${"Budgeted".padStart(10)} ` +
      `${"Spent".padStart(10)} ${"CarryIn".padStart(10)} ${"Available".padStart(11)}`,
  );
  for (const c of m.categories) {
    console.log(
      `  ${(nameById.get(c.categoryId) ?? c.categoryId).padEnd(20)} ` +
        `${c.type.padEnd(6)} ${fmt(c.budgeted)} ${fmt(c.spent)} ` +
        `${fmt(c.carryIn)} ${fmt(c.available)}`,
    );
  }
  console.log("");
  console.log(
    `  Savings this month: ${fmt(m.savings.monthTotal)}   ` +
      `Cumulative: ${fmt(m.savings.cumulativeTotal)}`,
  );
  for (const [accId, total] of Object.entries(m.savings.cumulativeByAccount)) {
    console.log(`    ${accId.padEnd(12)} ${fmt(total)}`);
  }
}
console.log("=".repeat(72));
