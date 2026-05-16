import { useMemo, useState } from "react";
import { computeMonth, resolveType } from "../engine.js";
import { cumulativeSavings, savingsThisMonth } from "../app/derived.js";
import { savingsTrend } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { monthLabel, nextMonth, prevMonth } from "../app/utils/month.js";
import type { Month } from "../types.js";
import { SavingsTrendChart } from "../components/SavingsTrendChart.js";

function addMonths(month: Month, delta: number): Month {
  let m = month;
  const step = delta > 0 ? nextMonth : prevMonth;
  for (let i = 0; i < Math.abs(delta); i++) m = step(m);
  return m;
}

export function SavingsScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setSelectedScreen = useAppStore((s) => s.setSelectedScreen);

  const [trendRange, setTrendRange] = useState<6 | 12 | 24>(12);
  const trendFrom = addMonths(month, -(trendRange - 1));
  const trend = useMemo(
    () => savingsTrend(budget, trendFrom, month),
    [budget, trendFrom, month],
  );

  const monthSummary = useMemo(() => computeMonth(budget, month), [budget, month]);
  const monthNet = useMemo(() => savingsThisMonth(budget, monthSummary), [budget, monthSummary]);
  const cumulative = useMemo(() => cumulativeSavings(budget, month), [budget, month]);

  const savingsCategories = useMemo(
    () => budget.categories.filter((c) => !c.archived && c.group === "Savings"),
    [budget.categories],
  );

  const rowsForCategories = useMemo(() => {
    return savingsCategories.map((c) => {
      const r = monthSummary.categories.find((cr) => cr.categoryId === c.id);
      const activeType = resolveType(c, month);
      return {
        id: c.id,
        name: c.name,
        type: activeType,
        budgeted: r?.budgeted ?? 0,
        spent: r?.spent ?? 0,
        carryIn: r?.carryIn ?? 0,
        available: r?.available ?? 0,
      };
    });
  }, [savingsCategories, monthSummary, month]);

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">{monthLabel(month)} savings</h2>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <div className="text-xs text-ink-muted">This month</div>
            <div className="text-lg font-semibold tabular-nums">{formatGBP(monthNet)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-muted">Cumulative</div>
            <div className="text-lg font-semibold tabular-nums">{formatGBP(cumulative)}</div>
          </div>
        </div>
        <p className="text-xs text-ink-muted mt-2">
          Per Savings category, we count whichever is larger — the budget you set or the
          activities you logged — so it works whether you treat the budget as the deposit or
          log transactions as deposits. Cumulative sums this across all months.
        </p>
      </section>

      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">Savings categories</h2>
          <button
            type="button"
            className="text-xs text-status-info underline-offset-2 hover:underline"
            onClick={() => setSelectedScreen("budget")}
          >
            Manage on Budget →
          </button>
        </div>
        {rowsForCategories.length === 0 ? (
          <p className="text-xs text-ink-muted mt-2">
            No Savings-tagged categories yet. Add one via Budget → + Category, set the group
            to Savings, and pick Pot if you want the balance to roll over.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {rowsForCategories.map((r) => (
              <li key={r.id} className="rounded-xl border border-surface-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{r.name}</span>
                  <span className="pill bg-surface-sunken text-ink-muted">{r.type}</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <Stat label="Budgeted" value={r.budgeted} />
                  <Stat label="Activities" value={r.spent} />
                  <Stat label="Counted" value={Math.max(r.budgeted, r.spent)} />
                  <Stat
                    label={r.type === "Pot" ? "Pot balance" : "Remaining"}
                    value={r.available}
                  />
                </div>
                {r.type === "Pot" && r.carryIn !== 0 && (
                  <p className="text-xs text-ink-muted mt-1">
                    Carried in from last month:{" "}
                    <span className={r.carryIn >= 0 ? "text-status-ok" : "text-status-over"}>
                      {r.carryIn >= 0 ? "+" : "−"}
                      {formatGBP(Math.abs(r.carryIn))}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">
            Trend ({monthLabel(trendFrom)} – {monthLabel(month)})
          </h2>
          <div className="flex gap-1">
            {([6, 12, 24] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`text-xs px-2 py-1 rounded-lg ${
                  trendRange === n
                    ? "bg-ink text-surface font-semibold"
                    : "bg-surface-sunken text-ink-muted"
                }`}
                onClick={() => setTrendRange(n)}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <SavingsTrendChart points={trend} />
        </div>
        <p className="text-xs text-ink-muted mt-2">
          Bars: amount counted per month — the larger of your budget or your logged activities
          for each Savings category. The line tracks cumulative savings across all months.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-ink-muted">{label}</div>
      <div
        className={`font-semibold tabular-nums ${value < 0 ? "text-status-over" : "text-ink"}`}
      >
        {value < 0 ? "−" : ""}
        {formatGBP(Math.abs(value))}
      </div>
    </div>
  );
}
