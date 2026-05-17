import { useMemo, useState } from "react";
import { computeMonth, resolveType } from "../engine.js";
import { cumulativeSavings, savingsThisMonth } from "../app/derived.js";
import { savingsTrend } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { useBudgetView } from "../app/effectiveBudget.js";
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
  const { effective } = useBudgetView();
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setSelectedScreen = useAppStore((s) => s.setSelectedScreen);

  const [trendRange, setTrendRange] = useState<6 | 12 | 24>(12);
  const trendFrom = addMonths(month, -(trendRange - 1));
  const trend = useMemo(
    () => savingsTrend(effective, trendFrom, month),
    [effective, trendFrom, month],
  );

  const monthSummary = useMemo(() => computeMonth(effective, month), [effective, month]);
  const monthNet = useMemo(
    () => savingsThisMonth(effective, monthSummary),
    [effective, monthSummary],
  );
  const cumulative = useMemo(() => cumulativeSavings(effective, month), [effective, month]);

  const savingsCategories = useMemo(
    () => effective.categories.filter((c) => !c.archived && c.group === "Savings"),
    [effective.categories],
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
    <div className="flex flex-col gap-6">
      <section className="card-hero p-6">
        <span className="section-eyebrow">Cumulative savings</span>
        <div className="mt-2">
          <h2 className="text-display-xl text-balance-gradient stat-num">
            {formatGBP(cumulative)}
          </h2>
        </div>
        <div className="mt-5 pt-4 border-t border-surface-border flex items-baseline justify-between">
          <div>
            <div className="section-eyebrow text-ink-muted">{monthLabel(month)}</div>
            <div className="mt-1.5 text-[18px] font-semibold stat-num text-ink">
              {formatGBP(monthNet)}
            </div>
          </div>
          <div className="text-right max-w-[60%]">
            <p className="text-[11px] text-ink-muted leading-snug">
              Per Savings category we count whichever is larger — the budget or the logged
              activities.
            </p>
          </div>
        </div>
      </section>

      <section className="px-1">
        <div className="section-row mb-4">
          <h2 className="section-title">Savings categories</h2>
          <button
            type="button"
            className="text-[12px] font-medium text-accent hover:underline underline-offset-2"
            onClick={() => setSelectedScreen("budget")}
          >
            Manage on Budget →
          </button>
        </div>
        {rowsForCategories.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-[13px] text-ink-soft leading-snug">
              No Savings-tagged categories yet. Add one via Budget → + Category, set the group
              to Savings, and pick Pot if you want the balance to roll over.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rowsForCategories.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-group-savings" aria-hidden="true" />
                    <span className="text-[15px] font-semibold tracking-tight text-ink truncate">
                      {r.name}
                    </span>
                  </div>
                  <span className="pill bg-surface-sunken text-ink-muted">{r.type}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-3">
                  <Stat label="Budgeted" value={r.budgeted} />
                  <Stat label="Activities" value={r.spent} />
                  <Stat label="Counted" value={Math.max(r.budgeted, r.spent)} highlight />
                  <Stat
                    label={r.type === "Pot" ? "Pot balance" : "Remaining"}
                    value={r.available}
                  />
                </div>
                {r.type === "Pot" && r.carryIn !== 0 && (
                  <p className="text-[11px] text-ink-muted mt-3">
                    Carried in:{" "}
                    <span
                      className={
                        r.carryIn >= 0
                          ? "text-status-ok font-semibold stat-num"
                          : "text-status-over font-semibold stat-num"
                      }
                    >
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

      <section className="px-1">
        <div className="section-row mb-4">
          <div>
            <h2 className="section-title">Trend</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              {monthLabel(trendFrom)} – {monthLabel(month)}
            </p>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-surface-sunken border border-surface-border/60">
            {([6, 12, 24] as const).map((n) => {
              const active = trendRange === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`text-[12px] px-2.5 py-1 rounded-lg transition font-semibold ${
                    active ? "pill-active" : "text-ink-muted hover:text-ink"
                  }`}
                  onClick={() => setTrendRange(n)}
                >
                  {n}m
                </button>
              );
            })}
          </div>
        </div>
        <div className="card p-4">
          <SavingsTrendChart points={trend} />
          <p className="text-[11px] text-ink-muted mt-2 leading-snug px-2">
            Bars: amount counted per month. Line: cumulative savings across all months.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="section-eyebrow">{label}</div>
      <div
        className={`mt-1 text-[14px] stat-num ${
          highlight ? "font-bold text-ink" : "font-semibold"
        } ${value < 0 ? "text-status-over" : "text-ink"}`}
      >
        {value < 0 ? "−" : ""}
        {formatGBP(Math.abs(value))}
      </div>
    </div>
  );
}
