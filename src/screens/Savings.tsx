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
    <div className="flex flex-col gap-4">
      <section className="card-hero p-5">
        <span className="section-eyebrow">{monthLabel(month)} savings</span>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] text-ink-muted uppercase tracking-wider">This month</div>
            <div className="text-display-md text-ink stat-num mt-1">{formatGBP(monthNet)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-ink-muted uppercase tracking-wider">Cumulative</div>
            <div className="text-display-md text-ink stat-num mt-1">{formatGBP(cumulative)}</div>
          </div>
        </div>
        <p className="text-[12px] text-ink-muted mt-3 leading-snug">
          Per Savings category we count whichever is larger — the budget you set or the
          activities you logged. Cumulative sums this across all months.
        </p>
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <span className="section-eyebrow">Savings categories</span>
          <button
            type="button"
            className="text-[12px] font-medium text-status-info hover:underline underline-offset-2"
            onClick={() => setSelectedScreen("budget")}
          >
            Manage on Budget →
          </button>
        </div>
        {rowsForCategories.length === 0 ? (
          <p className="text-[12px] text-ink-muted mt-3 leading-snug">
            No Savings-tagged categories yet. Add one via Budget → + Category, set the group
            to Savings, and pick Pot if you want the balance to roll over.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {rowsForCategories.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-surface-border bg-surface-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold tracking-tight text-ink">
                    {r.name}
                  </span>
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
                  <p className="text-[12px] text-ink-muted mt-3">
                    Carried in from last month:{" "}
                    <span
                      className={
                        r.carryIn >= 0 ? "text-status-ok font-medium" : "text-status-over font-medium"
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

      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <span className="section-eyebrow">Trend</span>
            <div className="text-[13px] text-ink-soft mt-0.5">
              {monthLabel(trendFrom)} – {monthLabel(month)}
            </div>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-surface-sunken">
            {([6, 12, 24] as const).map((n) => {
              const active = trendRange === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`text-[12px] px-2.5 py-1 rounded-lg transition font-semibold ${
                    active
                      ? "bg-surface-card text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                  onClick={() => setTrendRange(n)}
                >
                  {n}m
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4">
          <SavingsTrendChart points={trend} />
        </div>
        <p className="text-[12px] text-ink-muted mt-2 leading-snug">
          Bars: amount counted per month. The line tracks cumulative savings across all months.
        </p>
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
