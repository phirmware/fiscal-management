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
import type { CategoryRow } from "../app/derived.js";
import { useAppStore } from "../app/store.js";
import { useBudgetView } from "../app/effectiveBudget.js";
import { formatGBP, parseMoneyInput, roundMoney } from "../app/utils/money.js";
import { AnimatedGBP } from "../components/AnimatedNumber.js";
import { IncomeBreakdown } from "../components/IncomeBreakdown.js";
import { Modal } from "../components/Modal.js";
import { OverspendPrompt } from "../components/OverspendPrompt.js";
import { showToast } from "../components/Toast.js";

const GROUP_VAR: Record<string, string> = {
  Needs: "--c-group-needs",
  Wants: "--c-group-wants",
  Savings: "--c-group-savings",
};

function GroupComparisonRow({
  label,
  actual,
  benchmark,
  groupVar,
}: {
  label: string;
  actual: number;
  benchmark: number;
  groupVar: string;
}) {
  const ratio = benchmark <= 0 ? 0 : actual / benchmark;
  const fillPct = Math.min(100, Math.max(0, ratio * 100));
  const overshootPct = Math.max(0, ratio - 1) * 100;
  const overshootDisplay = Math.min(100, overshootPct);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: `rgb(var(${groupVar}))` }}
            aria-hidden="true"
          />
          <span className="text-[13px] font-semibold text-ink tracking-tight">{label}</span>
        </div>
        <span className="stat-num text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">{formatGBP(actual)}</span>{" "}
          <span className="text-ink-muted">/ {formatGBP(benchmark)}</span>
          {overshootPct > 0 && (
            <span className="ml-1.5 text-status-over font-semibold">
              +{Math.round(overshootPct)}%
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 relative h-2 w-full rounded-full bg-surface-sunken overflow-hidden flex">
        <div
          className="h-full rounded-full bar-anim transition-[width] duration-500 ease-out"
          style={{
            width: `${fillPct}%`,
            background: `linear-gradient(90deg,
              rgb(var(${groupVar}) / 0.75) 0%,
              rgb(var(${groupVar})) 100%)`,
          }}
        />
        {overshootDisplay > 0 && (
          <div
            className="h-full bar-anim"
            style={{
              width: `${overshootDisplay * 0.5}%`,
              background: `linear-gradient(90deg,
                rgb(var(--c-status-over) / 0.8) 0%,
                rgb(var(--c-status-over)) 100%)`,
              boxShadow: "0 0 0 1px rgb(var(--c-status-over) / 0.35)",
            }}
            title={`${Math.round(overshootPct)}% over benchmark`}
          />
        )}
      </div>
    </div>
  );
}

function TopSpendingSection({ rows }: { rows: CategoryRow[] }) {
  const top = useMemo(() => {
    const spenders = rows
      .filter((r) => r.group !== "Savings" && r.spent > 0)
      .sort((a, b) => b.spent - a.spent);
    const total = roundMoney(spenders.reduce((s, r) => s + r.spent, 0));
    return { list: spenders.slice(0, 3), total };
  }, [rows]);

  if (top.list.length === 0 || top.total <= 0) return null;

  return (
    <section className="dashboard-band">
      <div className="section-row mb-4">
        <div>
          <h2 className="section-title">Biggest spends</h2>
          <p className="text-[12px] text-ink-muted mt-0.5">
            Where the money actually went this month.
          </p>
        </div>
      </div>
      <ul role="list" className="space-y-3.5">
        {top.list.map((r, i) => {
          const share = Math.round((r.spent / top.total) * 100);
          const groupVar = GROUP_VAR[r.group] ?? "--c-accent";
          return (
            <li key={r.categoryId}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center
                      text-[10px] font-semibold shrink-0"
                    style={{
                      background: `rgb(var(${groupVar}) / 0.14)`,
                      color: `rgb(var(${groupVar}))`,
                    }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-semibold text-ink tracking-tight truncate">
                    {r.name}
                  </span>
                </div>
                <span className="stat-num text-[13px] whitespace-nowrap">
                  <span className="font-semibold text-ink">{formatGBP(r.spent)}</span>
                  <span className="text-ink-muted ml-1.5">{share}%</span>
                </span>
              </div>
              <div className="mt-1.5 ml-7 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full rounded-full bar-anim"
                  style={{
                    width: `${Math.min(100, (r.spent / top.total) * 100)}%`,
                    background: `rgb(var(${groupVar}) / 0.85)`,
                  }}
                  aria-hidden="true"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
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
    if (v !== null) {
      setIncome(month, v);
      showToast(`Income set to ${formatGBP(v)}`);
    }
    setIncomeOpen(false);
  }

  let riseIndex = 0;
  const rise = () => ({ ["--rise-i" as string]: riseIndex++ });

  return (
    <div className="flex flex-col gap-6">
      <div className="rise" style={rise()}>
        <IncomeBreakdown
          breakdown={breakdown}
          incomeSet={monthSummary.incomeSet}
          onSetIncome={() => {
            setDraftIncome(String(monthSummary.income || ""));
            setIncomeOpen(true);
          }}
        />
      </div>

      {unresolved.length > 0 && (
        <div className="rise" style={rise()}>
          <OverspendPrompt rows={unresolved} month={month} />
        </div>
      )}

      <div className="rise" style={rise()}>
        <LeftToSpendCard
          leftToSpend={breakdown.leftToSpend}
          spendingBudget={breakdown.spendingBudget}
          spendingSpent={breakdown.spendingSpent}
        />
      </div>

      <section className="dashboard-band rise" style={rise()}>
        <div className="section-row mb-4">
          <div>
            <h2 className="section-title">Money split</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              How your spending compares to the 50 / 30 / 20 benchmark.
            </p>
          </div>
        </div>
        {monthSummary.income > 0 ? (
          <div className="space-y-4">
            <GroupComparisonRow
              label="Needs"
              actual={totals.needs}
              benchmark={benchmark.needs}
              groupVar="--c-group-needs"
            />
            <GroupComparisonRow
              label="Wants"
              actual={totals.wants}
              benchmark={benchmark.wants}
              groupVar="--c-group-wants"
            />
            <GroupComparisonRow
              label="Savings"
              actual={totals.savings}
              benchmark={benchmark.savings}
              groupVar="--c-group-savings"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-sunken/60 px-4 py-3.5">
            <p className="text-[12px] text-ink-soft leading-snug">
              Set this month's income to unlock the benchmark comparison.
            </p>
            <button
              type="button"
              className="btn-secondary btn-sm shrink-0"
              onClick={() => {
                setDraftIncome("");
                setIncomeOpen(true);
              }}
            >
              Set income
            </button>
          </div>
        )}
      </section>

      <div className="rise" style={rise()}>
        <TopSpendingSection rows={rows} />
      </div>

      <section className="dashboard-band rise" style={rise()}>
        <div className="section-row mb-4">
          <div>
            <h2 className="section-title">Savings</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              Across all Savings categories.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="section-eyebrow text-ink-muted">This month</div>
            <AnimatedGBP
              value={savedThisMonth}
              className="block text-display-md text-ink stat-num mt-2"
            />
          </div>
          <div className="text-right">
            <div className="section-eyebrow text-ink-muted">Cumulative</div>
            <AnimatedGBP
              value={savedCumulative}
              className="block text-display-md text-ink stat-num mt-2"
            />
          </div>
        </div>
        {!hasSavingsCategories && (
          <p className="text-[12px] text-ink-muted mt-4 leading-snug">
            No Savings categories yet. Add one from Budget → + Category and tag it Savings.
          </p>
        )}
      </section>

      <Modal
        open={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        title="Income for this month"
        onSubmit={saveIncome}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setIncomeOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-accent">
              Save
            </button>
          </>
        }
      >
        <label htmlFor="income-input" className="block text-[13px] font-medium text-ink-soft mb-2">
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
            id="income-input"
            name="income"
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

function LeftToSpendCard({
  leftToSpend,
  spendingBudget,
  spendingSpent,
}: {
  leftToSpend: number;
  spendingBudget: number;
  spendingSpent: number;
}) {
  // Don't render if there's no Needs/Wants budget to speak of.
  if (spendingBudget <= 0 && spendingSpent <= 0) return null;

  const usedFraction =
    spendingBudget > 0 ? spendingSpent / spendingBudget : spendingSpent > 0 ? 1.1 : 0;
  const fillPct = Math.min(100, Math.max(0, usedFraction * 100));
  const isOver = leftToSpend < 0;
  const isFull = !isOver && usedFraction >= 1;
  const isClose = !isOver && !isFull && usedFraction >= 0.75;

  const statusVar = isOver
    ? "--c-status-over"
    : isFull
      ? "--c-status-full"
      : isClose
        ? "--c-status-warn"
        : "--c-status-ok";
  const statusLabel = isOver
    ? "Over budget"
    : isFull
      ? "Budget fully used"
      : isClose
        ? "Running low"
        : "On track";

  return (
    <section className="dashboard-band">
      <div className="absolute inset-x-5 top-0 h-1 ledger-strip opacity-60" aria-hidden="true" />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="section-eyebrow">Left to spend this month</div>
          <p className="text-[11px] text-ink-muted mt-1 leading-snug">
            Needs + Wants budgets, minus what you've spent.
          </p>
        </div>
        <span
          className="pill gap-1.5 px-2 py-0.5 whitespace-nowrap shrink-0"
          style={{
            background: `rgb(var(${statusVar}) / 0.14)`,
            color: `rgb(var(${statusVar}))`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: `rgb(var(${statusVar}))` }}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <AnimatedGBP
          value={leftToSpend}
          className={`text-display-xl stat-num ${isOver ? "text-status-over" : "text-ink"}`}
        />
        {spendingBudget > 0 && (
          <span className="text-[12px] text-ink-muted stat-num">
            of {formatGBP(spendingBudget)}
          </span>
        )}
      </div>

      <div
        className="mt-4 relative h-2.5 rounded-full bg-surface-sunken overflow-hidden"
        style={
          isFull || isOver
            ? { boxShadow: `inset 0 0 0 1px rgb(var(${statusVar}) / 0.18)` }
            : undefined
        }
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bar-anim transition-[width] duration-500 ease-out"
          style={{
            width: `${fillPct}%`,
            background: `linear-gradient(90deg,
              rgb(var(${statusVar}) / 0.78) 0%,
              rgb(var(${statusVar})) 100%)`,
            boxShadow:
              isFull || isOver
                ? `0 0 0 1px rgb(var(${statusVar}) / 0.35), 0 4px 12px -2px rgb(var(${statusVar}) / 0.4)`
                : undefined,
          }}
          aria-hidden="true"
        />
        {fillPct > 0 && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 55%)",
              width: `${fillPct}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between text-[12px]">
        <span className="text-ink-muted stat-num">
          <span className="font-semibold text-ink">{formatGBP(spendingSpent)}</span> spent
        </span>
        <span className="text-ink-muted stat-num">
          {Math.round(Math.min(100, usedFraction * 100))}% used
        </span>
      </div>
    </section>
  );
}
