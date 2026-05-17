import { useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import { categoryRows, unresolvedOverspends } from "../app/derived.js";
import type { CategoryRow as CategoryRowData, OverspendRow } from "../app/derived.js";
import { unresolvedReleases } from "../app/insights.js";
import type { ReleaseEntry } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { formatGBP } from "../app/utils/money.js";
import { CategoryRow } from "../components/CategoryRow.js";
import { OverspendPrompt } from "../components/OverspendPrompt.js";
import { ReallocationDialog } from "../components/ReallocationDialog.js";
import { ReleaseDialog } from "../components/ReleaseDialog.js";
import { Modal } from "../components/Modal.js";
import type { CategoryType, Group } from "../types.js";
import { parseMoneyInput } from "../app/utils/money.js";
import { monthLabel } from "../app/utils/month.js";

export function BudgetScreen() {
  const budget = useAppStore((s) => s.budget);
  const acks = useAppStore((s) => s.overspendAcks);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const addCategory = useAppStore((s) => s.addCategory);

  const setBudget = useAppStore((s) => s.setBudget);
  const releaseAcks = useAppStore((s) => s.releaseAcks);

  const monthSummary = useMemo(() => computeMonth(budget, month), [budget, month]);
  const rows = useMemo(
    () => categoryRows(budget, monthSummary, acks, month),
    [budget, monthSummary, acks, month],
  );
  const unresolved = unresolvedOverspends(rows);
  const releases = useMemo(
    () => unresolvedReleases(budget, month, releaseAcks),
    [budget, month, releaseAcks],
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
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="section-eyebrow">Month at a glance</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
            + Category
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Budgeted" value={monthSummary.totalBudgeted} />
          <Stat label="Spent" value={monthSummary.totalSpent} />
          <Stat label="Unallocated" value={monthSummary.unallocated} />
        </div>
      </section>

      {releases.length > 0 && (
        <section className="rounded-2xl border border-status-info/30 bg-status-infoSoft/40 p-4">
          <h2 className="text-[14px] font-semibold text-ink tracking-tight">
            {releases.length === 1
              ? `${releases[0]!.categoryName}: ${formatGBP(Math.abs(releases[0]!.amount))} released from Pot→Limit conversion.`
              : `${releases.length} categories converted — released amounts need a home.`}
          </h2>
          <p className="text-[12px] text-ink-soft mt-1 leading-snug">
            The accumulated Pot balance from last month is no longer earmarked. Assign it
            elsewhere or leave it in unallocated.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {releases.map((r) => (
              <li
                key={r.categoryId}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface-card/50
                  border border-status-info/15 px-3 py-2"
              >
                <div className="text-[13px] min-w-0">
                  <span className="font-medium text-ink">{r.categoryName}</span>
                  <span
                    className={`ml-2 stat-num font-semibold ${
                      r.amount < 0 ? "text-status-over" : "text-status-info"
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

      {(["Needs", "Wants", "Savings"] as const).map((g) =>
        byGroup[g].length === 0 ? null : (
          <section key={g} className="flex flex-col gap-2.5">
            <h3 className="section-eyebrow px-1">{g}</h3>
            {byGroup[g].map((row) => (
              <CategoryRow
                key={row.categoryId}
                row={row}
                month={month}
                onResolveOverspend={() => setOverspendFor(rowToOverspend(row))}
              />
            ))}
          </section>
        ),
      )}

      {rows.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-[14px] text-ink-soft">No categories for this month yet.</p>
          <button type="button" className="btn-primary mt-4" onClick={() => setAddOpen(true)}>
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
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="section-eyebrow">{label}</div>
      <div
        className={`mt-1 text-[15px] font-semibold stat-num ${
          value < 0 ? "text-status-over" : "text-ink"
        }`}
      >
        {value < 0 ? "−" : ""}
        {formatGBP(Math.abs(value))}
      </div>
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
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={!name.trim()}>
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
      className="grid gap-1 p-1 rounded-xl bg-surface-sunken"
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
            className={`text-[13px] font-semibold py-1.5 rounded-lg transition
              ${active ? "bg-surface-card text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
