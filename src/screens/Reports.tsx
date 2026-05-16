import { useMemo, useState } from "react";
import { computeMonth, computeSavings } from "../engine.js";
import { rangeSummary } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { downloadCsv, toCsv } from "../app/utils/csv.js";
import { monthLabel, monthsBetween, nextMonth, prevMonth } from "../app/utils/month.js";
import type { Month } from "../types.js";

function addMonths(month: Month, delta: number): Month {
  let m = month;
  const step = delta > 0 ? nextMonth : prevMonth;
  for (let i = 0; i < Math.abs(delta); i++) m = step(m);
  return m;
}

export function ReportsScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const [span, setSpan] = useState<1 | 3 | 6 | 12>(1);
  const fromMonth = addMonths(month, -(span - 1));

  const summary = useMemo(() => rangeSummary(budget, fromMonth, month), [budget, fromMonth, month]);

  const monthBreakdowns = useMemo(() => {
    const months = monthsBetween(fromMonth, month);
    return months.map((m) => {
      const ms = computeMonth(budget, m);
      const sav = computeSavings(budget, m);
      return { month: m, summary: ms, savings: sav };
    });
  }, [budget, fromMonth, month]);

  const txnCount = useMemo(() => {
    let count = 0;
    for (const t of budget.transactions) {
      const tm = t.date.slice(0, 7);
      if (tm >= fromMonth && tm <= month) count++;
    }
    return count;
  }, [budget.transactions, fromMonth, month]);

  function exportTransactionsCsv() {
    const headers = ["date", "category", "type", "group", "amount", "note"];
    const byId = new Map(budget.categories.map((c) => [c.id, c]));
    const rows = budget.transactions
      .filter((t) => {
        const tm = t.date.slice(0, 7);
        return tm >= fromMonth && tm <= month;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => {
        const cat = byId.get(t.categoryId);
        return [
          t.date,
          cat?.name ?? "Unknown",
          cat?.typeSegments[cat.typeSegments.length - 1]?.type ?? "",
          cat?.group ?? "",
          t.amount,
          t.note ?? "",
        ];
      });
    const csv = toCsv(headers, rows);
    downloadCsv(`transactions-${fromMonth}_to_${month}.csv`, csv);
  }

  function exportSummaryCsv() {
    const headers = ["month", "income", "budgeted", "spent", "saved", "unallocated"];
    const rows = monthBreakdowns.map((b) => [
      b.month,
      b.summary.income,
      b.summary.totalBudgeted,
      b.summary.totalSpent,
      b.savings.monthTotal,
      b.summary.unallocated,
    ]);
    downloadCsv(`summary-${fromMonth}_to_${month}.csv`, toCsv(headers, rows));
  }

  function exportCategoriesCsv() {
    const headers = ["month", "category", "type", "group", "budgeted", "spent", "carryIn", "available"];
    const byId = new Map(budget.categories.map((c) => [c.id, c]));
    const rows: (string | number)[][] = [];
    for (const b of monthBreakdowns) {
      for (const r of b.summary.categories) {
        const cat = byId.get(r.categoryId);
        rows.push([
          b.month,
          cat?.name ?? "Unknown",
          r.type,
          cat?.group ?? "",
          r.budgeted,
          r.spent,
          r.carryIn,
          r.available,
        ]);
      }
    }
    downloadCsv(`categories-${fromMonth}_to_${month}.csv`, toCsv(headers, rows));
  }

  function printStatement() {
    window.print();
  }

  const byId = new Map(budget.categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4 print:hidden">
        <h2 className="text-sm font-semibold text-ink-soft">Report range</h2>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {([1, 3, 6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`btn text-sm py-2 px-0 ${
                span === n ? "bg-ink text-surface" : "bg-surface-sunken text-ink-soft"
              }`}
              onClick={() => setSpan(n)}
            >
              {n === 1 ? "1 mo" : `${n} mo`}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-muted mt-2">
          {monthLabel(fromMonth)} – {monthLabel(month)} · {summary.monthCount} month
          {summary.monthCount === 1 ? "" : "s"} · {txnCount} transactions
        </p>
      </section>

      <section className="card p-4 print:hidden">
        <h2 className="text-sm font-semibold text-ink-soft">Export</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={exportTransactionsCsv}>
            Transactions CSV
          </button>
          <button type="button" className="btn-secondary text-sm" onClick={exportSummaryCsv}>
            Monthly summary CSV
          </button>
          <button type="button" className="btn-secondary text-sm" onClick={exportCategoriesCsv}>
            Category breakdown CSV
          </button>
          <button type="button" className="btn-primary text-sm" onClick={printStatement}>
            Print / Save as PDF
          </button>
        </div>
        <p className="text-xs text-ink-muted mt-2">
          "Save as PDF" uses your browser's print dialog — the statement below is what gets printed.
        </p>
      </section>

      <section className="card p-4 statement">
        <header className="border-b border-surface-border pb-3 mb-3 print:mb-4">
          <h1 className="text-base font-semibold">Budget statement</h1>
          <p className="text-xs text-ink-muted">
            {monthLabel(fromMonth)} – {monthLabel(month)} · generated {new Date().toLocaleString("en-GB")}
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <StatementCell label="Income" value={formatGBP(summary.totalIncome)} />
          <StatementCell label="Budgeted" value={formatGBP(summary.totalBudgeted)} />
          <StatementCell label="Spent" value={formatGBP(summary.totalSpent)} />
          <StatementCell label="Saved" value={formatGBP(summary.totalSaved)} />
        </div>

        <h2 className="mt-5 text-sm font-semibold">Monthly breakdown</h2>
        <table className="mt-2 w-full text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="text-left py-1 pr-2">Month</th>
              <th className="text-right py-1 px-2">Income</th>
              <th className="text-right py-1 px-2">Budgeted</th>
              <th className="text-right py-1 px-2">Spent</th>
              <th className="text-right py-1 pl-2">Saved</th>
            </tr>
          </thead>
          <tbody>
            {monthBreakdowns.map((b) => (
              <tr key={b.month} className="border-t border-surface-border">
                <td className="py-1 pr-2">{monthLabel(b.month)}</td>
                <td className="text-right py-1 px-2 tabular-nums">{formatGBP(b.summary.income)}</td>
                <td className="text-right py-1 px-2 tabular-nums">{formatGBP(b.summary.totalBudgeted)}</td>
                <td className="text-right py-1 px-2 tabular-nums">{formatGBP(b.summary.totalSpent)}</td>
                <td className="text-right py-1 pl-2 tabular-nums">{formatGBP(b.savings.monthTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-5 text-sm font-semibold">Categories</h2>
        <table className="mt-2 w-full text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="text-left py-1 pr-2">Category</th>
              <th className="text-left py-1 px-2">Group</th>
              <th className="text-right py-1 px-2">Budgeted</th>
              <th className="text-right py-1 px-2">Spent</th>
              <th className="text-right py-1 pl-2">Available</th>
            </tr>
          </thead>
          <tbody>
            {monthBreakdowns.flatMap((b) =>
              b.summary.categories.map((r, idx) => {
                const cat = byId.get(r.categoryId);
                return (
                  <tr key={`${b.month}-${r.categoryId}-${idx}`} className="border-t border-surface-border">
                    <td className="py-1 pr-2">
                      {cat?.name ?? "Unknown"}
                      <span className="text-ink-muted ml-1">· {b.month}</span>
                    </td>
                    <td className="py-1 px-2">{cat?.group ?? "—"}</td>
                    <td className="text-right py-1 px-2 tabular-nums">{formatGBP(r.budgeted)}</td>
                    <td className="text-right py-1 px-2 tabular-nums">{formatGBP(r.spent)}</td>
                    <td className={`text-right py-1 pl-2 tabular-nums ${r.available < 0 ? "text-status-over" : ""}`}>
                      {formatGBP(r.available)}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatementCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border p-2">
      <div className="text-ink-muted">{label}</div>
      <div className="font-semibold text-sm tabular-nums">{value}</div>
    </div>
  );
}
