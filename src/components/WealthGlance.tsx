import { useMemo } from "react";
import { useBudgetView } from "../app/effectiveBudget.js";
import { useAppStore } from "../app/store.js";
import { healthReport, netWorthSeries } from "../app/wealth.js";
import { formatGBP } from "../app/utils/money.js";
import { addMonths, todayIso } from "../app/utils/month.js";
import { AnimatedGBP } from "./AnimatedNumber.js";
import { Sparkline } from "./Sparkline.js";

/** Home's bridge from the monthly budget to the bigger picture. */
export function WealthGlance() {
  const wealth = useAppStore((s) => s.wealth);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setSelectedScreen = useAppStore((s) => s.setSelectedScreen);
  const { effective } = useBudgetView();
  const today = todayIso();

  const report = useMemo(
    () => (wealth.accounts.length > 0 ? healthReport({ wealth, budget: effective, month, today }) : null),
    [wealth, effective, month, today],
  );
  const spark = useMemo(
    () => netWorthSeries(wealth, addMonths(month, -11), month, effective.transactions, today).filter((p) => p.hasData),
    [wealth, month, effective.transactions, today],
  );

  if (!report) {
    return (
      <section className="dashboard-band">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="section-title">Track your net worth</h2>
            <p className="text-[12px] text-ink-muted mt-0.5 leading-snug text-pretty">
              Add savings, investments, pensions and debts to see your full picture and red flags.
            </p>
          </div>
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setSelectedScreen("wealth")}>
            Set up
          </button>
        </div>
      </section>
    );
  }

  const nw = report.current.netWorth;
  const prev = spark.length >= 2 ? spark[spark.length - 2]!.netWorth : null;
  const delta = prev === null ? null : nw - prev;
  const urgent = report.flags.filter((f) => f.severity === "critical" || f.severity === "warning");

  return (
    <section className="dashboard-band !p-0">
      <button
        type="button"
        onClick={() => setSelectedScreen("wealth")}
        className="w-full text-left px-5 py-5 hover:bg-surface-sunken/30 transition rounded-[inherit]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-eyebrow">Net worth</p>
            <p className="mt-1.5 text-display-md text-ink stat-num">
              <AnimatedGBP value={nw} />
            </p>
            {delta !== null && delta !== 0 && (
              <p className={`mt-0.5 text-[12px] font-semibold stat-num ${delta > 0 ? "text-status-ok" : "text-status-over"}`}>
                {delta > 0 ? "+" : "−"}
                {formatGBP(Math.abs(delta))} <span className="font-medium text-ink-muted">vs last month</span>
              </p>
            )}
          </div>
          {spark.length >= 2 && <Sparkline values={spark.map((p) => p.netWorth)} className="w-24 h-10 shrink-0 mt-1" />}
        </div>
        {urgent.length > 0 ? (
          <ul role="list" className="mt-4 flex flex-col gap-1.5">
            {urgent.slice(0, 2).map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-[12px] font-medium text-ink-soft">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${f.severity === "critical" ? "bg-status-over" : "bg-status-warn"}`}
                  aria-hidden="true"
                />
                <span className="truncate">{f.title}</span>
              </li>
            ))}
            {urgent.length > 2 && (
              <li className="text-[12px] text-ink-muted pl-3.5">+{urgent.length - 2} more in Wealth → Health</li>
            )}
          </ul>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-[12px] font-medium text-ink-soft">
            <span className="size-1.5 rounded-full bg-status-ok shrink-0" aria-hidden="true" />
            No red flags right now
          </p>
        )}
      </button>
    </section>
  );
}
