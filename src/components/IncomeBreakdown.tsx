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

      <div className="mt-3 pt-4 border-t border-surface-border">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-ink uppercase tracking-wider">
              Not yet assigned
            </div>
            <div className="text-[11px] text-ink-muted mt-1 leading-snug">
              Money with no job yet — consider assigning it.
            </div>
          </div>
          <div className="stat-num text-display-md text-ink whitespace-nowrap">
            {formatGBP(notYetAssigned)}
          </div>
        </div>
      </div>
    </section>
  );
}
