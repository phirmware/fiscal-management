import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import { categoryRows, monthBreakdown, unresolvedOverspends } from "../app/derived.js";
import type { CategoryRow as CategoryRowData, OverspendRow } from "../app/derived.js";
import { unresolvedReleases } from "../app/insights.js";
import type { ReleaseEntry } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { useBudgetView } from "../app/effectiveBudget.js";
import { formatGBP, roundMoney } from "../app/utils/money.js";
import { AnimatedGBP } from "../components/AnimatedNumber.js";
import { CategoryRow } from "../components/CategoryRow.js";
import { OverspendPrompt } from "../components/OverspendPrompt.js";
import { ReallocationDialog } from "../components/ReallocationDialog.js";
import { ReleaseDialog } from "../components/ReleaseDialog.js";
import { Modal } from "../components/Modal.js";
import { showToast } from "../components/Toast.js";
import type { CategoryType, Group } from "../types.js";
import { parseMoneyInput } from "../app/utils/money.js";
import { monthLabel } from "../app/utils/month.js";

export function BudgetScreen() {
  const { effective, source } = useBudgetView();
  const acks = useAppStore((s) => s.overspendAcks);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const addCategory = useAppStore((s) => s.addCategory);

  const setBudget = useAppStore((s) => s.setBudget);
  const releaseAcks = useAppStore((s) => s.releaseAcks);

  const monthSummary = useMemo(() => computeMonth(effective, month), [effective, month]);
  const rows = useMemo(
    () => categoryRows(effective, source, monthSummary, acks, month),
    [effective, source, monthSummary, acks, month],
  );
  const breakdown = useMemo(
    () => monthBreakdown(effective, monthSummary),
    [effective, monthSummary],
  );
  const unresolved = unresolvedOverspends(rows);
  const releases = useMemo(
    () => unresolvedReleases(effective, month, releaseAcks),
    [effective, month, releaseAcks],
  );

  const [overspendFor, setOverspendFor] = useState<OverspendRow | null>(null);
  const [releaseFor, setReleaseFor] = useState<ReleaseEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  function rowToOverspend(row: CategoryRowData): OverspendRow {
    return {
      categoryId: row.categoryId,
      name: row.name,
      amount: -row.available,
      acknowledged: row.acknowledged,
    };
  }

  const byGroup: Record<Group, CategoryRowData[]> = { Needs: [], Wants: [], Savings: [] };
  for (const r of rows) byGroup[r.group].push(r);

  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero holo-panel p-6 rise" style={{ "--rise-i": 0 } as React.CSSProperties}>
        <div className="absolute inset-x-6 top-0 h-1 ledger-strip opacity-70" aria-hidden="true" />
        <div className="relative">
          <div className="section-row">
            <span className="section-eyebrow">Unallocated this month</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
              + Category
            </button>
          </div>
          <div className="mt-3">
            <h2
              className={`text-display-xl stat-num ${
                monthSummary.unallocated < 0 ? "text-status-over" : "text-balance-gradient"
              }`}
            >
              <AnimatedGBP value={monthSummary.unallocated} />
            </h2>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2.5 max-[380px]:grid-cols-1">
            <div className="metric-tile">
              <div className="section-eyebrow text-ink-muted truncate">Budgeted</div>
              <div className="mt-1.5 text-[16px] font-semibold stat-num text-ink">
                {formatGBP(monthSummary.totalBudgeted)}
              </div>
            </div>
            <div className="metric-tile text-center">
              <div className="section-eyebrow text-ink-muted truncate">Spent</div>
              <div className="mt-1.5 text-[16px] font-semibold stat-num text-ink">
                {formatGBP(monthSummary.totalSpent)}
              </div>
            </div>
            <div className="metric-tile text-right">
              <div className="section-eyebrow text-ink-muted truncate">Left</div>
              <div
                className={`mt-1.5 text-[16px] font-semibold stat-num ${
                  breakdown.leftToSpend < 0 ? "text-status-over" : "text-status-ok"
                }`}
              >
                {breakdown.leftToSpend < 0 ? "−" : ""}
                {formatGBP(Math.abs(breakdown.leftToSpend))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {releases.length > 0 && (
        <section
          className="rounded-3xl border border-accent/30 p-5 rise"
          style={{ background: "rgb(var(--c-accent) / 0.06)", "--rise-i": 1 } as React.CSSProperties}
        >
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 mt-0.5 text-accent" aria-hidden="true">
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 1.5v3h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h2 className="text-[14px] font-semibold text-ink tracking-tight">
                {releases.length === 1
                  ? `${formatGBP(Math.abs(releases[0]!.amount))} released from ${releases[0]!.categoryName}`
                  : `${releases.length} categories converted — released amounts need a home`}
              </h2>
              <p className="text-[12px] text-ink-soft mt-1 leading-snug">
                The accumulated Pot balance is no longer earmarked. Assign it elsewhere or
                leave it in unallocated.
              </p>
            </div>
          </div>
          <ul role="list" className="mt-4 flex flex-col gap-2">
            {releases.map((r) => (
              <li
                key={r.categoryId}
                className="flex items-center justify-between gap-2 rounded-2xl bg-surface-card
                  border border-surface-border px-4 py-2.5"
              >
                <div className="text-[13px] min-w-0">
                  <span className="font-semibold text-ink">{r.categoryName}</span>
                  <span
                    className={`ml-2 stat-num font-semibold ${
                      r.amount < 0 ? "text-status-over" : "text-accent"
                    }`}
                  >
                    {r.amount < 0 ? "−" : "+"}
                    {formatGBP(Math.abs(r.amount))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReleaseFor(r)}
                  className="btn-secondary btn-sm"
                >
                  Handle
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unresolved.length > 0 && <OverspendPrompt rows={unresolved} month={month} />}

      {(["Needs", "Wants", "Savings"] as const).map((g, gi) => {
        if (byGroup[g].length === 0) return null;
        const groupVar =
          g === "Needs" ? "--c-group-needs" : g === "Wants" ? "--c-group-wants" : "--c-group-savings";
        const groupTotal = roundMoney(byGroup[g].reduce((s, r) => s + r.spent, 0));
        const groupBudgeted = roundMoney(byGroup[g].reduce((s, r) => s + r.budgeted, 0));
        const usedPct =
          groupBudgeted > 0 ? Math.min(100, (groupTotal / groupBudgeted) * 100) : null;
        const sharePct = usedPct !== null ? Math.round((groupTotal / groupBudgeted) * 100) : null;
        return (
          <section
            key={g}
            className="ledger-panel rise"
            style={{ "--rise-i": gi + 2 } as React.CSSProperties}
          >
            <div className="ledger-header">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: `rgb(var(${groupVar}))` }}
                  aria-hidden="true"
                />
                <h3 className="text-[13px] font-semibold tracking-tight text-ink">{g}</h3>
                <span className="text-[11px] text-ink-muted">
                  · {byGroup[g].length} {byGroup[g].length === 1 ? "category" : "categories"}
                </span>
              </div>
              <div className="text-right">
                <div className="text-[12px] stat-num">
                  <span className="font-semibold text-ink">{formatGBP(groupTotal)}</span>
                  {groupBudgeted > 0 && (
                    <span className="text-ink-muted"> / {formatGBP(groupBudgeted)}</span>
                  )}
                </div>
                {sharePct !== null && (
                  <div
                    className="text-[11px] font-semibold mt-0.5"
                    style={{ color: `rgb(var(${groupVar}))` }}
                  >
                    {sharePct}% used
                  </div>
                )}
              </div>
            </div>
            {/* Group meter — the header strip doubles as a real progress bar. */}
            <div className="relative z-[1] h-1 bg-surface-sunken/60" aria-hidden="true">
              <div
                className="h-full bar-anim"
                style={{
                  width: `${usedPct ?? 0}%`,
                  background: `linear-gradient(90deg, rgb(var(${groupVar}) / 0.55), rgb(var(${groupVar})))`,
                }}
              />
            </div>
            <div>
              {byGroup[g].map((row) => (
                <CategoryRow
                  key={row.categoryId}
                  row={row}
                  month={month}
                  onResolveOverspend={() => setOverspendFor(rowToOverspend(row))}
                />
              ))}
            </div>
          </section>
        );
      })}

      {rows.length === 0 && (
        <div className="card p-10 text-center rise" style={{ "--rise-i": 2 } as React.CSSProperties}>
          <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-3 text-accent" aria-hidden="true">
            <ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth={1.8} />
            <path
              d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </svg>
          <p className="text-[15px] font-semibold text-ink">No categories for this month yet</p>
          <p className="text-[13px] text-ink-muted mt-1 leading-snug">
            Categories are the envelopes your money lives in.
          </p>
          <button type="button" className="btn-accent mt-4" onClick={() => setAddOpen(true)}>
            Add your first category
          </button>
        </div>
      )}

      <ReallocationDialog row={overspendFor} month={month} onClose={() => setOverspendFor(null)} />
      <ReleaseDialog entry={releaseFor} onClose={() => setReleaseFor(null)} />

      <AddCategoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultMonth={month}
        onSubmit={({ monthlyBudget, ...payload }) => {
          const id = addCategory(payload);
          if (monthlyBudget !== undefined && monthlyBudget > 0) {
            setBudget(id, month, monthlyBudget);
          }
          showToast(`${payload.name} added to ${payload.group}`);
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddCategoryModal({
  open,
  onClose,
  defaultMonth,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultMonth: string;
  onSubmit: (payload: {
    name: string;
    group: Group;
    type: CategoryType;
    fromMonth: string;
    annualTarget?: number;
    monthlyBudget?: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<Group>("Needs");
  const [type, setType] = useState<CategoryType>("Limit");
  const [advanced, setAdvanced] = useState(false);
  const [annualTarget, setAnnualTarget] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tgt = parseMoneyInput(annualTarget);
    const budgetAmount = parseMoneyInput(monthlyBudget);
    onSubmit({
      name: trimmed,
      group,
      type,
      fromMonth: defaultMonth,
      ...(tgt !== null ? { annualTarget: tgt } : {}),
      ...(budgetAmount !== null ? { monthlyBudget: budgetAmount } : {}),
    });
    setName("");
    setGroup("Needs");
    setType("Limit");
    setAnnualTarget("");
    setMonthlyBudget("");
    setAdvanced(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New category"
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-accent" disabled={!name.trim()}>
            Add
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Name</span>
          <input
            className="input-base"
            name="category-name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
          />
        </label>

        <div>
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Group</span>
          <Segmented
            value={group}
            options={["Needs", "Wants", "Savings"]}
            onChange={(v) => setGroup(v as Group)}
          />
        </div>

        <div>
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Type</span>
          <Segmented
            value={type}
            options={["Limit", "Pot"]}
            onChange={(v) => setType(v as CategoryType)}
          />
          <p className="text-[12px] text-ink-muted mt-2 leading-snug">
            {type === "Limit"
              ? "Resets every month — for monthly spending ceilings like groceries."
              : "Accumulates over time — for irregular costs like gifts or car maintenance."}
          </p>
        </div>

        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">
            Budget for {monthLabel(defaultMonth)}{" "}
            <span className="text-ink-muted font-normal">(optional)</span>
          </span>
          <input
            className="input-base stat-num"
            name="monthly-budget"
            inputMode="decimal"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            placeholder="0.00"
          />
          <p className="text-[12px] text-ink-muted mt-1.5 leading-snug">
            Change any time by tapping the budgeted amount on the category row.
          </p>
        </label>

        <button
          type="button"
          className="text-[12px] font-medium text-status-info hover:underline underline-offset-2 self-start"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Hide advanced" : "Advanced ↓"}
        </button>
        {advanced && (
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">
              Annual target <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <input
              className="input-base stat-num"
              name="annual-target"
              inputMode="decimal"
              value={annualTarget}
              onChange={(e) => setAnnualTarget(e.target.value)}
              placeholder="e.g. 1200"
            />
            <p className="text-[12px] text-ink-muted mt-1.5 leading-snug">
              Useful for sinking-fund Pots — stored only, not yet used in calculations.
            </p>
          </label>
        )}
      </div>
    </Modal>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="seg"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className="seg-btn !py-1.5"
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
