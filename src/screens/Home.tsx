import { useMemo, useState } from "react";
import { computeMonth, computeSavings } from "../engine.js";
import {
  categoryRows,
  fiftyThirtyTwentyBenchmark,
  groupTotals,
  monthBreakdown,
  unresolvedOverspends,
} from "../app/derived.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { IncomeBreakdown } from "../components/IncomeBreakdown.js";
import { Modal } from "../components/Modal.js";
import { OverspendPrompt } from "../components/OverspendPrompt.js";
import { parseMoneyInput } from "../app/utils/money.js";

function GroupComparisonRow({
  label,
  actual,
  benchmark,
  colour,
}: {
  label: string;
  actual: number;
  benchmark: number;
  colour: string;
}) {
  const ratio = benchmark <= 0 ? 0 : actual / benchmark;
  const fillPct = Math.min(100, Math.max(0, ratio * 100));
  const overshootPct = Math.max(0, ratio - 1) * 100;
  const overshootDisplay = Math.min(100, overshootPct);
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-soft">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          {formatGBP(actual)} <span className="text-ink-muted">vs {formatGBP(benchmark)}</span>
          {overshootPct > 0 && (
            <span className="ml-1.5 text-status-warn font-medium">
              +{Math.round(overshootPct)}%
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-surface-sunken overflow-hidden flex">
        <div className={`h-full ${colour}`} style={{ width: `${fillPct}%` }} />
        {overshootDisplay > 0 && (
          <div
            className="h-full bg-status-warn/80"
            style={{ width: `${overshootDisplay * 0.5}%` }}
            title={`${Math.round(overshootPct)}% over benchmark`}
          />
        )}
      </div>
    </div>
  );
}

export function HomeScreen() {
  const budget = useAppStore((s) => s.budget);
  const acks = useAppStore((s) => s.overspendAcks);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setIncome = useAppStore((s) => s.setIncome);

  const monthSummary = useMemo(() => computeMonth(budget, month), [budget, month]);
  const savingsSummary = useMemo(() => computeSavings(budget, month), [budget, month]);
  const rows = useMemo(
    () => categoryRows(budget, monthSummary, acks, month),
    [budget, monthSummary, acks, month],
  );
  const breakdown = monthBreakdown(monthSummary, savingsSummary);
  const totals = groupTotals(budget, monthSummary, savingsSummary);
  const benchmark = fiftyThirtyTwentyBenchmark(monthSummary.income);
  const unresolved = unresolvedOverspends(rows);

  const [incomeOpen, setIncomeOpen] = useState(false);
  const [draftIncome, setDraftIncome] = useState<string>(String(monthSummary.income || ""));

  function saveIncome() {
    const v = parseMoneyInput(draftIncome);
    if (v !== null) setIncome(month, v);
    setIncomeOpen(false);
  }

  const totalSavedCumulative = savingsSummary.cumulativeTotal;

  return (
    <div className="flex flex-col gap-4">
      <IncomeBreakdown
        breakdown={breakdown}
        incomeSet={monthSummary.incomeSet}
        onSetIncome={() => {
          setDraftIncome(String(monthSummary.income || ""));
          setIncomeOpen(true);
        }}
      />

      {unresolved.length > 0 && <OverspendPrompt rows={unresolved} month={month} />}

      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">50/30/20 comparison</h2>
          <button
            type="button"
            onClick={() => {
              setDraftIncome(String(monthSummary.income || ""));
              setIncomeOpen(true);
            }}
            className="text-xs text-status-info underline-offset-2 hover:underline"
          >
            Edit income
          </button>
        </div>
        <p className="text-xs text-ink-muted mt-1">
          A rough benchmark — useful as context, not pass/fail. Cost of living and higher
          incomes shift these targets.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <GroupComparisonRow
            label="Needs"
            actual={totals.needs}
            benchmark={benchmark.needs}
            colour="bg-group-needs"
          />
          <GroupComparisonRow
            label="Wants"
            actual={totals.wants}
            benchmark={benchmark.wants}
            colour="bg-group-wants"
          />
          <GroupComparisonRow
            label="Savings"
            actual={totals.savings}
            benchmark={benchmark.savings}
            colour="bg-group-savings"
          />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Savings</h2>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <div className="text-xs text-ink-muted">This month</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatGBP(savingsSummary.monthTotal)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-muted">Cumulative</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatGBP(totalSavedCumulative)}
            </div>
          </div>
        </div>
        {budget.savingsAccounts.length === 0 && (
          <p className="text-xs text-ink-muted mt-2">
            No savings accounts yet. Add one from Settings.
          </p>
        )}
      </section>

      <Modal
        open={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        title="Income for this month"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setIncomeOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={saveIncome}>
              Save
            </button>
          </>
        }
      >
        <label className="text-sm">
          <span className="block text-ink-soft mb-1">Net (after-tax) income</span>
          <input
            type="text"
            inputMode="decimal"
            className="input-base"
            value={draftIncome}
            onChange={(e) => setDraftIncome(e.target.value)}
            placeholder="e.g. 2500"
            autoFocus
          />
        </label>
        <p className="text-xs text-ink-muted mt-2">
          Applies only to this month. Set per-month so a raise or a side-hustle change flows
          through correctly.
        </p>
      </Modal>
    </div>
  );
}
