import type { MonthBreakdown } from "../app/derived.js";
import { formatGBP } from "../app/utils/money.js";

interface IncomeBreakdownProps {
  breakdown: MonthBreakdown;
  incomeSet: boolean;
  onSetIncome?: () => void;
}

function Row({
  label,
  value,
  prefix,
  hint,
}: {
  label: string;
  value: number;
  prefix?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-[13px] text-ink-soft">{label}</div>
        {hint && <div className="text-[11px] text-ink-muted mt-0.5">{hint}</div>}
      </div>
      <div className="stat-num whitespace-nowrap text-[13px] text-ink-soft">
        {prefix ?? ""}
        {formatGBP(Math.abs(value))}
      </div>
    </div>
  );
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
    <section className="card-hero p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="section-eyebrow">Net income</span>
        {!incomeSet ? (
          <button
            type="button"
            onClick={onSetIncome}
            className="text-[11px] font-semibold text-accent uppercase tracking-widest
              hover:underline underline-offset-2"
          >
            + Add income
          </button>
        ) : (
          <button
            type="button"
            onClick={onSetIncome}
            className="text-[11px] font-medium text-ink-muted hover:text-ink
              uppercase tracking-widest"
          >
            Edit
          </button>
        )}
      </div>

      <div className="mt-2">
        <h2 className="text-display-xl text-balance-gradient stat-num">{formatGBP(income)}</h2>
      </div>

      <div className="mt-5 space-y-0">
        <Row
          label="Spending budget"
          value={spendingBudget}
          prefix="−"
          hint="Needs + Wants categories"
        />
        <div className="divider-soft" />
        <Row
          label="Savings allocated"
          value={savingsAllocated}
          prefix="−"
          hint="Savings categories"
        />
      </div>

      <div
        className="mt-5 rounded-2xl border px-4 py-3.5"
        style={{
          background:
            naState === "over"
              ? "rgb(var(--c-status-over) / 0.08)"
              : "rgb(var(--c-accent) / 0.06)",
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
            {notYetAssigned < 0 ? "−" : ""}
            {formatGBP(Math.abs(notYetAssigned))}
          </div>
        </div>
      </div>
    </section>
  );
}
