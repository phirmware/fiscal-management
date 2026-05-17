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
import { useBudgetView } from "../app/effectiveBudget.js";
import { formatGBP } from "../app/utils/money.js";
import { IncomeBreakdown } from "../components/IncomeBreakdown.js";
import { Modal } from "../components/Modal.js";
import { OverspendPrompt } from "../components/OverspendPrompt.js";
import { parseMoneyInput } from "../app/utils/money.js";

function GroupComparisonRow({
  label,
  actual,
  benchmark,
  dotColour,
  fillColour,
}: {
  label: string;
  actual: number;
  benchmark: number;
  dotColour: string;
  fillColour: string;
}) {
  const ratio = benchmark <= 0 ? 0 : actual / benchmark;
  const fillPct = Math.min(100, Math.max(0, ratio * 100));
  const overshootPct = Math.max(0, ratio - 1) * 100;
  const overshootDisplay = Math.min(100, overshootPct);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColour}`} aria-hidden="true" />
          <span className="text-[13px] font-semibold text-ink tracking-tight">{label}</span>
        </div>
        <span className="stat-num text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">{formatGBP(actual)}</span>{" "}
          <span className="text-ink-muted">/ {formatGBP(benchmark)}</span>
          {overshootPct > 0 && (
            <span className="ml-1.5 text-status-warn font-semibold">
              +{Math.round(overshootPct)}%
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden flex">
        <div
          className={`h-full ${fillColour} rounded-full transition-[width] duration-500 ease-out`}
          style={{ width: `${fillPct}%` }}
        />
        {overshootDisplay > 0 && (
          <div
            className="h-full bg-status-warn/70"
            style={{ width: `${overshootDisplay * 0.5}%` }}
            title={`${Math.round(overshootPct)}% over benchmark`}
          />
        )}
      </div>
    </div>
  );
}

export function HomeScreen() {
  const { effective, source } = useBudgetView();
  const acks = useAppStore((s) => s.overspendAcks);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setIncome = useAppStore((s) => s.setIncome);

  const monthSummary = useMemo(() => computeMonth(effective, month), [effective, month]);
  const rows = useMemo(
    () => categoryRows(effective, source, monthSummary, acks, month),
    [effective, source, monthSummary, acks, month],
  );
  const breakdown = useMemo(
    () => monthBreakdown(effective, monthSummary),
    [effective, monthSummary],
  );
  const totals = useMemo(() => groupTotals(effective, monthSummary), [effective, monthSummary]);
  const benchmark = fiftyThirtyTwentyBenchmark(monthSummary.income);
  const unresolved = unresolvedOverspends(rows);
  const savedThisMonth = useMemo(
    () => savingsThisMonth(effective, monthSummary),
    [effective, monthSummary],
  );
  const savedCumulative = useMemo(() => cumulativeSavings(effective, month), [effective, month]);
  const hasSavingsCategories = useMemo(() => savingsCategoryIds(effective).size > 0, [effective]);

  const [incomeOpen, setIncomeOpen] = useState(false);
  const [draftIncome, setDraftIncome] = useState<string>(String(monthSummary.income || ""));

  function saveIncome() {
    const v = parseMoneyInput(draftIncome);
    if (v !== null) setIncome(month, v);
    setIncomeOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <IncomeBreakdown
        breakdown={breakdown}
        incomeSet={monthSummary.incomeSet}
        onSetIncome={() => {
          setDraftIncome(String(monthSummary.income || ""));
          setIncomeOpen(true);
        }}
      />

      {unresolved.length > 0 && <OverspendPrompt rows={unresolved} month={month} />}

      <section className="px-1">
        <div className="section-row mb-4">
          <div>
            <h2 className="section-title">Money split</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              How your spending compares to the 50 / 30 / 20 benchmark.
            </p>
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <GroupComparisonRow
            label="Needs"
            actual={totals.needs}
            benchmark={benchmark.needs}
            dotColour="bg-group-needs"
            fillColour="bg-group-needs"
          />
          <GroupComparisonRow
            label="Wants"
            actual={totals.wants}
            benchmark={benchmark.wants}
            dotColour="bg-group-wants"
            fillColour="bg-group-wants"
          />
          <GroupComparisonRow
            label="Savings"
            actual={totals.savings}
            benchmark={benchmark.savings}
            dotColour="bg-group-savings"
            fillColour="bg-group-savings"
          />
        </div>
      </section>

      <section className="px-1">
        <div className="section-row mb-4">
          <div>
            <h2 className="section-title">Savings</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              Across all Savings categories.
            </p>
          </div>
        </div>
        <div className="card p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="section-eyebrow text-ink-muted">This month</div>
              <div className="text-display-md text-ink stat-num mt-2">
                {formatGBP(savedThisMonth)}
              </div>
            </div>
            <div className="text-right">
              <div className="section-eyebrow text-ink-muted">Cumulative</div>
              <div className="text-display-md text-ink stat-num mt-2">
                {formatGBP(savedCumulative)}
              </div>
            </div>
          </div>
          {!hasSavingsCategories && (
            <p className="text-[12px] text-ink-muted mt-4 leading-snug">
              No Savings categories yet. Add one from Budget → + Category and tag it Savings.
            </p>
          )}
        </div>
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
            <button type="button" className="btn-accent" onClick={saveIncome}>
              Save
            </button>
          </>
        }
      >
        <label className="block text-[13px] font-medium text-ink-soft mb-2">
          Net (after-tax) income
        </label>
        <div className="relative">
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted
              text-xl font-semibold pointer-events-none stat-num"
            aria-hidden="true"
          >
            £
          </span>
          <input
            type="text"
            inputMode="decimal"
            className="input-base !pl-9 text-2xl font-semibold stat-num"
            value={draftIncome}
            onChange={(e) => setDraftIncome(e.target.value)}
            placeholder="2500"
            autoFocus
          />
        </div>
        <p className="text-[12px] text-ink-muted mt-2 leading-snug">
          Applies only to this month. Set per-month so a raise or side-hustle flows through.
        </p>
      </Modal>
    </div>
  );
}
