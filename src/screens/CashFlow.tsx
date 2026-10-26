import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useBudgetView } from "../app/effectiveBudget.js";
import { useAppStore } from "../app/store.js";
import { cashFlowSeries } from "../app/wealth.js";
import type { CashFlowMonth } from "../app/wealth.js";
import { formatGBP, roundMoney } from "../app/utils/money.js";
import { currentMonth } from "../app/state.js";
import { addMonths, monthLabel, shortMonthLabel } from "../app/utils/month.js";
import { CashFlowChart } from "../components/CashFlowChart.js";

const rise = (i: number) => ({ "--rise-i": i }) as CSSProperties;

export function CashFlowScreen() {
  const { effective } = useBudgetView();
  const month = useAppStore((s) => s.ui.selectedMonth);
  const movements = useAppStore((s) => s.wealth.movements);
  const [range, setRange] = useState<6 | 12 | 24>(12);
  const from = addMonths(month, -(range - 1));

  const series = useMemo(() => {
    const all = cashFlowSeries(effective, from, month, movements);
    // Trim empty months before tracking began, but keep at least six columns.
    const firstData = all.findIndex((m) => m.hasData);
    return firstData <= 0 ? all : all.slice(Math.min(firstData, Math.max(0, all.length - 6)));
  }, [effective, from, month, movements]);
  const active = series.filter((m) => m.hasData);
  // The calendar month in progress would flatter savings and skew comparisons.
  const inProgress = currentMonth();
  const completed = active.filter((m) => m.month !== inProgress);
  const stats = completed.length > 0 ? completed : active;

  const totals = useMemo(() => {
    const income = roundMoney(active.reduce((s, m) => s + m.totalIn, 0));
    const spending = roundMoney(active.reduce((s, m) => s + m.totalOut, 0));
    const needs = roundMoney(active.reduce((s, m) => s + m.needs, 0));
    const wants = roundMoney(active.reduce((s, m) => s + m.wants, 0));
    const net = roundMoney(income - spending);
    return { income, spending, needs, wants, net, rate: income > 0 ? net / income : null };
  }, [active]);

  const n = Math.max(1, stats.length);
  const statTotals = {
    income: stats.reduce((s, m) => s + m.totalIn, 0),
    spending: stats.reduce((s, m) => s + m.spending, 0),
    totalOut: stats.reduce((s, m) => s + m.totalOut, 0),
    offBudget: stats.reduce((s, m) => s + m.offBudget, 0),
    needs: stats.reduce((s, m) => s + m.needs, 0),
    wants: stats.reduce((s, m) => s + m.wants, 0),
  };
  const withIncome = stats.filter((m) => m.savingsRate !== null);
  const best = withIncome.reduce<CashFlowMonth | null>((a, b) => (!a || b.savingsRate! > a.savingsRate! ? b : a), null);
  const worst = withIncome.reduce<CashFlowMonth | null>((a, b) => (!a || b.savingsRate! < a.savingsRate! ? b : a), null);
  const negativeMonths = stats.filter((m) => m.net < 0).length;

  // Compare the most recent three active months against the three before them.
  const recent = stats.slice(-3);
  const earlier = stats.slice(-6, -3);
  const avg = (xs: CashFlowMonth[], f: (m: CashFlowMonth) => number) =>
    xs.length ? xs.reduce((s, m) => s + f(m), 0) / xs.length : 0;
  const spendTrend =
    earlier.length === 3 && avg(earlier, (m) => m.spending) > 0
      ? avg(recent, (m) => m.spending) / avg(earlier, (m) => m.spending) - 1
      : null;

  if (active.length === 0) {
    return (
      <section className="card p-6 text-center rise" style={rise(0)}>
        <p className="text-[14px] font-semibold text-ink">No cash flow yet</p>
        <p className="mt-1 text-[13px] text-ink-soft leading-snug">
          Set your monthly income on Home and log spending — this view shows money in vs out over time.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero holo-panel p-6 rise" style={rise(0)}>
        <div className="section-row">
          <span className="section-eyebrow">Left over · {range} months</span>
          <div className="flex gap-1 p-1 rounded-xl bg-surface-sunken border border-surface-border/60">
            {([6, 12, 24] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`text-[12px] px-2.5 py-1 rounded-lg transition font-semibold focus-ring ${
                  range === r ? "pill-active" : "text-ink-muted hover:text-ink"
                }`}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
              >
                {r}m
              </button>
            ))}
          </div>
        </div>
        <h2
          className={`mt-2 text-display-xl stat-num ${totals.net < 0 ? "text-status-over" : "text-balance-gradient"}`}
        >
          {totals.net < 0 ? "−" : ""}
          {formatGBP(Math.abs(totals.net))}
        </h2>
        <p className="mt-1 text-[12px] text-ink-muted">
          {totals.rate === null ? "No income recorded" : `${Math.round(totals.rate * 100)}% of income kept`} ·{" "}
          {monthLabel(active[0]!.month)} – {monthLabel(active[active.length - 1]!.month)}
        </p>
        <div className="hero-metrics mt-5">
          <div className="metric-tile">
            <div className="truncate text-[12px] font-semibold text-ink-soft">Avg in / month</div>
            <div className="mt-2 stat-num text-[18px] font-semibold text-status-ok">{formatGBP(statTotals.income / n)}</div>
          </div>
          <div className="metric-tile">
            <div className="truncate text-[12px] font-semibold text-ink-soft">Avg out / month</div>
            <div className="mt-2 stat-num text-[18px] font-semibold text-ink">{formatGBP(statTotals.totalOut / n)}</div>
          </div>
        </div>
      </section>

      <section className="dashboard-band rise" style={rise(1)}>
        <div className="mb-4">
          <h2 className="section-title">Money in vs out</h2>
          <p className="text-[12px] text-ink-muted mt-0.5">
            Income above the line, spending below. Transfers between your accounts aren't counted. Tap to inspect.
          </p>
        </div>
        <CashFlowChart points={series} />
      </section>

      <section className="dashboard-band rise" style={rise(2)}>
        <h2 className="section-title mb-4">Savings rate by month</h2>
        <ul role="list" className="flex flex-col gap-2">
          {active
            .slice()
            .reverse()
            .map((m) => {
              const r = m.savingsRate;
              const pct = r === null ? 0 : Math.round(r * 100);
              const v = r === null ? "--c-ink-faint" : r >= 0.2 ? "--c-status-ok" : r >= 0.1 ? "--c-status-info" : r >= 0 ? "--c-status-warn" : "--c-status-over";
              return (
                <li key={m.month} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3">
                  <p className="text-[12px] font-medium text-ink-soft truncate">
                    {shortMonthLabel(m.month)}
                    {m.month === inProgress && <span className="text-ink-muted"> ·</span>}
                  </p>
                  <div className="relative h-2 rounded-full bg-surface-sunken overflow-hidden">
                    {/* 20% benchmark tick */}
                    <span className="absolute inset-y-0 left-[40%] w-px bg-ink-faint/60 z-[1]" aria-hidden="true" />
                    <div
                      className="h-full rounded-full bar-anim"
                      style={{ width: `${Math.max(0, Math.min(100, pct * 2))}%`, background: `rgb(var(${v}))` }}
                    />
                  </div>
                  <p className="text-right text-[12px] font-semibold stat-num" style={{ color: `rgb(var(${v}))` }}>
                    {r === null ? "—" : `${pct}%`}
                  </p>
                </li>
              );
            })}
        </ul>
        <p className="mt-3 text-[11px] text-ink-muted leading-snug">
          Bar scale runs to 50%. The tick marks the 20% benchmark.
          {active.some((m) => m.month === inProgress) && " · marks the month in progress — averages below leave it out."}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 rise" style={rise(3)}>
        <Tile
          label="Needs share"
          value={statTotals.spending > 0 ? `${Math.round((statTotals.needs / statTotals.spending) * 100)}%` : "—"}
          sub={`${formatGBP(statTotals.needs / n)}/mo avg`}
        />
        <Tile
          label="Wants share"
          value={statTotals.spending > 0 ? `${Math.round((statTotals.wants / statTotals.spending) * 100)}%` : "—"}
          sub={`${formatGBP(statTotals.wants / n)}/mo avg`}
        />
        {best && (
          <Tile label="Best month" value={`${Math.round(best.savingsRate! * 100)}%`} sub={monthLabel(best.month)} tone="ok" />
        )}
        {worst && worst !== best && (
          <Tile
            label="Toughest month"
            value={`${Math.round(worst.savingsRate! * 100)}%`}
            sub={monthLabel(worst.month)}
            tone={worst.savingsRate! < 0 ? "over" : undefined}
          />
        )}
        {spendTrend !== null && (
          <Tile
            label="Spending trend"
            value={`${spendTrend > 0 ? "+" : ""}${Math.round(spendTrend * 100)}%`}
            sub="Last 3 months vs prior 3"
            tone={spendTrend > 0.1 ? "over" : spendTrend < -0.05 ? "ok" : undefined}
          />
        )}
        {statTotals.offBudget > 0 && (
          <Tile
            label="Off-budget spend"
            value={formatGBP(statTotals.offBudget / n)}
            sub="Per month, outside the budget"
          />
        )}
        <Tile
          label="Months in the red"
          value={`${negativeMonths} of ${stats.length}`}
          sub="Spent more than earned"
          tone={negativeMonths > 0 ? "over" : "ok"}
        />
      </section>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "over" }) {
  const cls = tone === "ok" ? "text-status-ok" : tone === "over" ? "text-status-over" : "text-ink";
  return (
    <div className="card p-4 min-w-0">
      <p className="truncate text-[12px] font-semibold text-ink-muted">{label}</p>
      <p className={`mt-1.5 text-[22px] font-semibold tracking-tight stat-num ${cls}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{sub}</p>
    </div>
  );
}
