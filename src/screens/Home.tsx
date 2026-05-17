import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import {
  categoryRows,
  cumulativeSavings,
  fiftyThirtyTwentyBenchmark,
  groupTotals,
  monthBreakdown,
  savingsCategoryIds,
  savingsThisMonth,
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
  const rows = useMemo(
    () => categoryRows(budget, monthSummary, acks, month),
    [budget, monthSummary, acks, month],
  );
  const breakdown = useMemo(() => monthBreakdown(budget, monthSummary), [budget, monthSummary]);
  const totals = useMemo(() => groupTotals(budget, monthSummary), [budget, monthSummary]);
  const benchmark = fiftyThirtyTwentyBenchmark(monthSummary.income);
  const unresolved = unresolvedOverspends(rows);
  const savedThisMonth = useMemo(
    () => savingsThisMonth(budget, monthSummary),
    [budget, monthSummary],
  );
  const savedCumulative = useMemo(() => cumulativeSavings(budget, month), [budget, month]);
  const hasSavingsCategories = useMemo(() => savingsCategoryIds(budget).size > 0, [budget]);

  const [incomeOpen, setIncomeOpen] = useState(false);
  const [draftIncome, setDraftIncome] = useState<string>(String(monthSummary.income || ""));

  function saveIncome() {
    const v = parseMoneyInput(draftIncome);
    if (v !== null) setIncome(month, v);
    setIncomeOpen(false);
  }

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

      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <span className="section-eyebrow">50 / 30 / 20</span>
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mt-0.5">
              How this month splits
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraftIncome(String(monthSummary.income || ""));
              setIncomeOpen(true);
            }}
            className="text-[12px] font-medium text-status-info hover:underline underline-offset-2"
          >
            Edit income
          </button>
        </div>
        <p className="text-[12px] text-ink-muted mt-1 leading-snug">
          A rough benchmark — not pass/fail. Cost of living and income level shift these.
        </p>
        <div className="mt-4 flex flex-col gap-3.5">
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

      <section className="card p-5">
        <span className="section-eyebrow">Savings</span>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] text-ink-muted uppercase tracking-wider">This month</div>
            <div className="text-display-md text-ink stat-num mt-1">
              {formatGBP(savedThisMonth)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-ink-muted uppercase tracking-wider">Cumulative</div>
            <div className="text-display-md text-ink stat-num mt-1">
              {formatGBP(savedCumulative)}
            </div>
          </div>
        </div>
        {!hasSavingsCategories && (
          <p className="text-[12px] text-ink-muted mt-3 leading-snug">
            No Savings categories yet. Add one from Budget → + Category and tag it Savings.
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
        <label className="block text-[13px] font-medium text-ink-soft mb-2">
          Net (after-tax) income
        </label>
        <input
          type="text"
          inputMode="decimal"
          className="input-base text-lg font-semibold stat-num"
          value={draftIncome}
          onChange={(e) => setDraftIncome(e.target.value)}
          placeholder="e.g. 2500"
          autoFocus
        />
        <p className="text-[12px] text-ink-muted mt-2 leading-snug">
          Applies only to this month. Set per-month so a raise or side-hustle flows through.
        </p>
      </Modal>
    </div>
  );
}
