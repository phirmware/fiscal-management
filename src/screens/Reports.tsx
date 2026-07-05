import { useMemo, useState } from "react";
import { computeMonth, createMonthCache } from "../engine.js";
import { savingsThisMonth } from "../app/derived.js";
import { rangeSummary } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { useBudgetView } from "../app/effectiveBudget.js";
import { formatGBP } from "../app/utils/money.js";
import { downloadCsv, toCsv } from "../app/utils/csv.js";
import { showToast } from "../components/Toast.js";
import { addMonths, monthLabel, monthsBetween } from "../app/utils/month.js";

export function ReportsScreen() {
  const { effective } = useBudgetView();
  const month = useAppStore((s) => s.ui.selectedMonth);
  const [span, setSpan] = useState<1 | 3 | 6 | 12>(1);
  const fromMonth = addMonths(month, -(span - 1));

  const summary = useMemo(
    () => rangeSummary(effective, fromMonth, month),
    [effective, fromMonth, month],
  );

  const monthBreakdowns = useMemo(() => {
    const months = monthsBetween(fromMonth, month);
    const cache = createMonthCache();
    return months.map((m) => {
      const ms = computeMonth(effective, m, cache);
      // "Saved" here MUST match the headline figure above — both derive from
      // Savings categories. (A previous version mixed in the legacy
      // savings-accounts ledger, which reads £0 for category-based savers.)
      return { month: m, summary: ms, saved: savingsThisMonth(effective, ms) };
    });
  }, [effective, fromMonth, month]);

  const txnCount = useMemo(() => {
    let count = 0;
    for (const t of effective.transactions) {
      const tm = t.date.slice(0, 7);
      if (tm >= fromMonth && tm <= month) count++;
    }
    return count;
  }, [effective.transactions, fromMonth, month]);

  function exportTransactionsCsv() {
    const headers = ["date", "category", "type", "group", "amount", "note"];
    const byId = new Map(effective.categories.map((c) => [c.id, c]));
    const rows = effective.transactions
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
    showToast(`Exported ${rows.length} transactions`);
  }

  function exportSummaryCsv() {
    const headers = ["month", "income", "budgeted", "spent", "saved", "unallocated"];
    const rows = monthBreakdowns.map((b) => [
      b.month,
      b.summary.income,
      b.summary.totalBudgeted,
      b.summary.totalSpent,
      b.saved,
      b.summary.unallocated,
    ]);
    downloadCsv(`summary-${fromMonth}_to_${month}.csv`, toCsv(headers, rows));
    showToast("Monthly summary exported");
  }

  function exportCategoriesCsv() {
    const headers = ["month", "category", "type", "group", "budgeted", "spent", "carryIn", "available"];
    const byId = new Map(effective.categories.map((c) => [c.id, c]));
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
    showToast("Category breakdown exported");
  }

  function printStatement() {
    window.print();
  }

  const byId = new Map(effective.categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-6">
      <section
        className="card-hero holo-panel p-6 print:hidden rise"
        style={{ "--rise-i": 0 } as React.CSSProperties}
      >
        <span className="section-eyebrow">Range</span>
        <div className="mt-3 seg grid-cols-4">
          {([1, 3, 6, 12] as const).map((n) => {
            const active = span === n;
            return (
              <button
                key={n}
                type="button"
                className="seg-btn"
                data-active={active}
                aria-pressed={active}
                onClick={() => setSpan(n)}
              >
                {n === 1 ? "1 month" : `${n} months`}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-ink-muted mt-3">
          {monthLabel(fromMonth)} – {monthLabel(month)} · {summary.monthCount} month
          {summary.monthCount === 1 ? "" : "s"} · {txnCount} transactions
        </p>
      </section>

      <section className="px-1 print:hidden rise" style={{ "--rise-i": 1 } as React.CSSProperties}>
        <h2 className="section-title mb-3">Export</h2>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={exportTransactionsCsv}>
            Transactions CSV
          </button>
          <button type="button" className="btn-secondary" onClick={exportSummaryCsv}>
            Monthly summary CSV
          </button>
          <button type="button" className="btn-secondary" onClick={exportCategoriesCsv}>
            Categories CSV
          </button>
          <button type="button" className="btn-accent" onClick={printStatement}>
            Print / Save as PDF
          </button>
        </div>
        <p className="text-[11px] text-ink-muted mt-2 leading-snug">
          "Save as PDF" uses your browser's print dialog — the statement below is what gets printed.
        </p>
      </section>

      <section className="card p-4 statement rise" style={{ "--rise-i": 2 } as React.CSSProperties}>
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
              <th className="text-left py-1 pr-2 whitespace-nowrap">Month</th>
              <th className="text-right py-1 px-2 whitespace-nowrap">Income</th>
              <th className="text-right py-1 px-2 whitespace-nowrap">Budgeted</th>
              <th className="text-right py-1 px-2 whitespace-nowrap">Spent</th>
              <th className="text-right py-1 pl-2 whitespace-nowrap">Saved</th>
            </tr>
          </thead>
          <tbody>
            {monthBreakdowns.map((b) => (
              <tr key={b.month} className="border-t border-surface-border">
                <td className="py-1 pr-2">{monthLabel(b.month)}</td>
                <td className="text-right py-1 px-2 tabular-nums">{formatGBP(b.summary.income)}</td>
                <td className="text-right py-1 px-2 tabular-nums">{formatGBP(b.summary.totalBudgeted)}</td>
                <td className="text-right py-1 px-2 tabular-nums">{formatGBP(b.summary.totalSpent)}</td>
                <td className="text-right py-1 pl-2 tabular-nums">{formatGBP(b.saved)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-5 text-sm font-semibold">Categories</h2>
        <table className="mt-2 w-full text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="text-left py-1 pr-2 whitespace-nowrap">Category</th>
              <th className="text-left py-1 px-2 whitespace-nowrap">Group</th>
              <th className="text-right py-1 px-2 whitespace-nowrap">Budgeted</th>
              <th className="text-right py-1 px-2 whitespace-nowrap">Spent</th>
              <th className="text-right py-1 pl-2 whitespace-nowrap">Available</th>
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
