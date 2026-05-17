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
  muted,
}: {
  label: string;
  value: number;
  prefix?: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className={`text-[13px] ${muted ? "text-ink-muted" : "text-ink-soft"}`}>{label}</div>
        {hint && <div className="text-[11px] text-ink-muted mt-0.5">{hint}</div>}
      </div>
      <div
        className={`stat-num whitespace-nowrap text-[13px] ${
          muted ? "text-ink-muted" : "text-ink-soft"
        }`}
      >
        {prefix ?? ""}
        {formatGBP(Math.abs(value))}
      </div>
    </div>
  );
}

export function IncomeBreakdown({ breakdown, incomeSet, onSetIncome }: IncomeBreakdownProps) {
  const { income, spendingBudget, savingsAllocated, notYetAssigned } = breakdown;

  return (
    <section className="card-hero p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="section-eyebrow">This month</span>
        {!incomeSet && (
          <button
            type="button"
            onClick={onSetIncome}
            className="text-[11px] font-semibold text-status-info uppercase tracking-wider
              hover:underline underline-offset-2"
          >
            + Add income
          </button>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <h2 className="text-display-lg text-ink stat-num">{formatGBP(income)}</h2>
        <span className="text-[13px] text-ink-muted">net income</span>
      </div>

      <div className="mt-4 space-y-0">
        <Row
          label="Spending budget"
          value={spendingBudget}
          prefix="−"
          hint="Needs + Wants categories"
          muted
        />
        <Row
          label="Savings allocated"
          value={savingsAllocated}
          prefix="−"
          hint="Savings categories"
          muted
        />
      </div>

      <div className="divider mt-2 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink">Not yet assigned</div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              Money with no job yet — consider assigning it.
            </div>
          </div>
          <div className="stat-num text-lg font-semibold text-ink whitespace-nowrap">
            {formatGBP(notYetAssigned)}
          </div>
        </div>
      </div>
    </section>
  );
}
