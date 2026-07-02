import type { MonthBreakdown } from "../app/derived.js";
import { formatGBP } from "../app/utils/money.js";
import { AnimatedGBP } from "./AnimatedNumber.js";

interface IncomeBreakdownProps {
  breakdown: MonthBreakdown;
  incomeSet: boolean;
  onSetIncome?: () => void;
}

export function IncomeBreakdown({ breakdown, incomeSet, onSetIncome }: IncomeBreakdownProps) {
  const { income, spendingBudget, savingsAllocated, notYetAssigned } = breakdown;
  const naState =
    notYetAssigned < 0 ? "over" : notYetAssigned === 0 ? "zero" : "positive";
  const naClasses =
    naState === "over"
      ? "text-status-over"
      : naState === "zero"
        ? "text-ink-soft"
        : "text-ink";
  const naCaption =
    naState === "over"
      ? "You've assigned more than your income — trim a budget."
      : naState === "zero"
        ? "Every pound has a job. Nice."
        : "Money with no job yet — consider assigning it.";

  return (
    <section className="card-hero holo-panel p-6">
      <div className="absolute inset-x-6 top-0 h-1 ledger-strip opacity-70" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="section-eyebrow">Net income</span>
          {!incomeSet ? (
            <button
              type="button"
              onClick={onSetIncome}
              className="btn-accent btn-sm"
            >
              + Add income
            </button>
          ) : (
            <button
              type="button"
              onClick={onSetIncome}
              className="btn-secondary btn-sm"
            >
              Edit
            </button>
          )}
        </div>

        <div className="mt-3">
          <h2 className="text-display-xl text-balance-gradient stat-num">
            <AnimatedGBP value={income} />
          </h2>
        </div>

        <div className="hero-metrics mt-5">
          <div className="metric-tile">
            <div className="text-[12px] font-semibold text-ink-soft">Spending budget</div>
            <div className="mt-2 stat-num text-[18px] font-semibold text-ink">
              {spendingBudget > 0 ? "−" : ""}
              {formatGBP(Math.abs(spendingBudget))}
            </div>
            <div className="text-[11px] text-ink-muted mt-1 leading-snug">
              Needs + Wants
            </div>
          </div>
          <div className="metric-tile">
            <div className="text-[12px] font-semibold text-ink-soft">Savings allocated</div>
            <div className="mt-2 stat-num text-[18px] font-semibold text-ink">
              {savingsAllocated > 0 ? "−" : ""}
              {formatGBP(Math.abs(savingsAllocated))}
            </div>
            <div className="text-[11px] text-ink-muted mt-1 leading-snug">
              Savings categories
            </div>
          </div>
        </div>

        <div
          className="mt-4 rounded-2xl border px-4 py-3.5"
          style={{
            background:
              naState === "over"
                ? "rgb(var(--c-status-over) / 0.08)"
                : "linear-gradient(135deg, rgb(var(--c-accent) / 0.10), rgb(var(--c-group-savings) / 0.08))",
            borderColor:
              naState === "over"
                ? "rgb(var(--c-status-over) / 0.25)"
                : "rgb(var(--c-accent) / 0.22)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                Not yet assigned
              </div>
              <div className="text-[11px] text-ink-muted mt-1 leading-snug">
                {naCaption}
              </div>
            </div>
            <div className={`stat-num text-display-md whitespace-nowrap ${naClasses}`}>
              <AnimatedGBP value={notYetAssigned} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
