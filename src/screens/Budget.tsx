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
      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">Month at a glance</h2>
          <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={() => setAddOpen(true)}>
            + Category
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-ink-muted">Budgeted</div>
            <div className="font-semibold tabular-nums">{formatGBP(monthSummary.totalBudgeted)}</div>
          </div>
          <div>
            <div className="text-ink-muted">Spent</div>
            <div className="font-semibold tabular-nums">{formatGBP(monthSummary.totalSpent)}</div>
          </div>
          <div>
            <div className="text-ink-muted">Unallocated</div>
            <div className="font-semibold tabular-nums">{formatGBP(monthSummary.unallocated)}</div>
          </div>
        </div>
      </section>

      {releases.length > 0 && (
        <section className="rounded-2xl border border-status-info/30 bg-status-infoSoft/60 p-4">
          <h2 className="text-sm font-semibold text-ink">
            {releases.length === 1
              ? `${releases[0]!.categoryName}: ${formatGBP(Math.abs(releases[0]!.amount))} released from Pot→Limit conversion.`
              : `${releases.length} categories converted from Pot to Limit — released amounts need a home.`}
          </h2>
          <p className="text-xs text-ink-soft mt-1">
            The accumulated Pot balance from last month is no longer earmarked. Assign it to
            another category for this month, or leave it in unallocated.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {releases.map((r) => (
              <li key={r.categoryId} className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-ink">{r.categoryName}</span>
                  <span
                    className={`ml-2 font-semibold ${r.amount < 0 ? "text-status-over" : "text-status-info"}`}
                  >
                    {r.amount < 0 ? "−" : "+"}
                    {formatGBP(Math.abs(r.amount))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReleaseFor(r)}
                  className="btn-secondary text-xs px-3 py-1.5"
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
          <section key={g} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted px-1">
              {g}
            </h3>
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
        <div className="card p-6 text-center">
          <p className="text-sm text-ink-soft">No categories for this month yet.</p>
          <button type="button" className="btn-primary mt-3" onClick={() => setAddOpen(true)}>
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
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          <span className="block text-ink-soft mb-1">Name</span>
          <input
            className="input-base"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          {(["Needs", "Wants", "Savings"] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={`btn ${
                group === g ? "bg-ink text-surface" : "bg-surface-sunken text-ink"
              } px-0`}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["Limit", "Pot"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`btn ${
                type === t ? "bg-ink text-surface" : "bg-surface-sunken text-ink"
              }`}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          {type === "Limit"
            ? "Resets every month — for monthly spending ceilings like groceries."
            : "Accumulates over time — for irregular costs like gifts or car maintenance."}
        </p>

        <label className="text-sm">
          <span className="block text-ink-soft mb-1">
            Budget for {monthLabel(defaultMonth)} (optional)
          </span>
          <input
            className="input-base"
            inputMode="decimal"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            placeholder="0.00"
          />
          <p className="text-xs text-ink-muted mt-1">
            You can change this any time by tapping the budgeted amount on the category row.
          </p>
        </label>

        <button
          type="button"
          className="text-xs text-status-info underline-offset-2 hover:underline self-start"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? "Hide advanced" : "Advanced"}
        </button>
        {advanced && (
          <label className="text-sm">
            <span className="block text-ink-soft mb-1">Annual target (optional)</span>
            <input
              className="input-base"
              inputMode="decimal"
              value={annualTarget}
              onChange={(e) => setAnnualTarget(e.target.value)}
              placeholder="e.g. 1200"
            />
            <p className="text-xs text-ink-muted mt-1">
              Useful for sinking-fund Pots — stored only, not yet used in calculations.
            </p>
          </label>
        )}
      </div>
    </Modal>
  );
}
