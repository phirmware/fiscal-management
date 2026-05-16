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
  emphasis,
  hint,
}: {
  label: string;
  value: number;
  prefix?: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <div className={`text-sm ${emphasis ? "font-semibold text-ink" : "text-ink-soft"}`}>
        {label}
        {hint && <div className="text-xs text-ink-muted font-normal mt-0.5">{hint}</div>}
      </div>
      <div
        className={`tabular-nums whitespace-nowrap ${
          emphasis ? "text-base font-semibold text-ink" : "text-sm text-ink-soft"
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
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink-soft">This month's money</h2>
        {!incomeSet && (
          <button
            type="button"
            onClick={onSetIncome}
            className="text-xs text-status-info font-medium underline-offset-2 hover:underline"
          >
            Add income
          </button>
        )}
      </div>

      <div className="mt-2">
        <Row label="Net income" value={income} />
        <Row
          label="− Spending budget"
          value={spendingBudget}
          prefix="−"
          hint="Sum of budgets for Needs + Wants categories"
        />
        <Row
          label="− Savings allocated"
          value={savingsAllocated}
          prefix="−"
          hint="Sum of budgets for Savings categories"
        />
        <div className="border-t border-surface-border mt-1 pt-1">
          <Row
            label="= Not yet assigned"
            value={notYetAssigned}
            emphasis
            hint="Money with no job yet — consider assigning it."
          />
        </div>
      </div>
    </section>
  );
}
