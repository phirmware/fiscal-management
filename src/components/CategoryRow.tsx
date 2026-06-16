import { useState } from "react";
import type { CategoryRow as CategoryRowData, StatusBucket } from "../app/derived.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { useAppStore } from "../app/store.js";
import { monthLabel } from "../app/utils/month.js";

const GROUP_BG: Record<string, string> = {
  Needs: "bg-group-needs",
  Wants: "bg-group-wants",
  Savings: "bg-group-savings",
};

const STATUS_DOT: Record<StatusBucket, string> = {
  ok: "bg-status-ok",
  close: "bg-status-warn",
  full: "bg-status-full",
  over: "bg-status-over",
  empty: "bg-ink-faint",
};

const STATUS_LABEL: Record<StatusBucket, string> = {
  ok: "Plenty left",
  close: "Almost full",
  full: "Full",
  over: "Over",
  empty: "Untracked",
};

const STATUS_PILL: Record<StatusBucket, string> = {
  ok: "bg-status-okSoft text-status-ok",
  close: "bg-status-warnSoft text-status-warn",
  full: "bg-status-fullSoft text-status-full",
  over: "bg-status-overSoft text-status-over",
  empty: "bg-surface-sunken text-ink-muted",
};

const STATUS_VAR: Record<StatusBucket, string> = {
  ok: "--c-status-ok",
  close: "--c-status-warn",
  full: "--c-status-full",
  over: "--c-status-over",
  empty: "--c-ink-faint",
};

interface Props {
  row: CategoryRowData;
  month: string;
  onResolveOverspend?: () => void;
}

export function CategoryRow({ row, month, onResolveOverspend }: Props) {
  const setBudget = useAppStore((s) => s.setBudget);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");

  const isPrefilled = row.prefillSourceMonth !== null;
  const reference = row.type === "Pot" ? row.budgeted + row.carryIn : row.budgeted;
  const rawUsedPct = reference <= 0 ? (row.spent > 0 ? 100 : 0) : (row.spent / reference) * 100;
  const usedPct = Math.min(100, rawUsedPct);
  const groupSpine = GROUP_BG[row.group] ?? "bg-ink-faint";
  const statusVar = STATUS_VAR[row.status];

  function startEdit() {
    setDraft(row.budgeted > 0 ? String(row.budgeted) : "");
    setEditing(true);
  }

  function commit() {
    const v = parseMoneyInput(draft);
    if (v !== null) setBudget(row.categoryId, month, v);
    setEditing(false);
  }

  const availableNegative = row.available < 0;
  const showGlow = row.status === "full" || row.status === "over";

  return (
    <div className="ledger-row">
      <div className={`ledger-rail ${groupSpine}`} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink truncate">
                {row.name}
              </h3>
              <span className="text-[11px] text-ink-muted whitespace-nowrap">{row.type}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`text-display-md stat-num ${
                  availableNegative ? "text-status-over" : "text-ink"
                } ${isPrefilled ? "italic" : ""}`}
              >
                {availableNegative ? "−" : ""}
                {formatGBP(Math.abs(row.available))}
              </span>
              <span className="text-[12px] text-ink-muted">
                {availableNegative ? "over" : "available"}
              </span>
            </div>
          </div>
          <span
            className={`pill ${STATUS_PILL[row.status]} gap-1.5 px-2 py-0.5 border border-current/10`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[row.status]}`}
              aria-hidden="true"
            />
            {STATUS_LABEL[row.status]}
          </span>
        </div>

        <div
          className="mt-3 relative h-2.5 rounded-full bg-surface-sunken/80 overflow-hidden"
          style={
            showGlow
              ? { boxShadow: `inset 0 0 0 1px rgb(var(${statusVar}) / 0.18)` }
              : undefined
          }
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${usedPct}%`,
              background: `linear-gradient(90deg,
                rgb(var(${statusVar}) / 0.78) 0%,
                rgb(var(${statusVar})) 100%)`,
              boxShadow: showGlow
                ? `0 0 0 1px rgb(var(${statusVar}) / 0.35), 0 4px 12px -2px rgb(var(${statusVar}) / 0.4)`
                : undefined,
            }}
            aria-hidden="true"
          />
          {/* Subtle inner highlight on the bar fill */}
          {usedPct > 0 && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 55%)",
                width: `${usedPct}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12px]">
          <div className="text-ink-muted stat-num">
            <span className="font-semibold text-ink">{formatGBP(row.spent)}</span>
            <span className="mx-1.5 text-ink-faint">of</span>
            {editing ? (
              <input
                className="input-base !inline !w-24 !py-1 !px-2 !text-[13px] !font-semibold stat-num"
                type="text"
                inputMode="decimal"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            ) : row.budgeted === 0 ? (
              <button
                type="button"
                onClick={startEdit}
                className="font-semibold text-accent hover:underline underline-offset-2
                  focus-ring rounded"
              >
                Set budget
              </button>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className={`font-semibold border-b border-dashed focus-ring rounded
                  ${
                    isPrefilled
                      ? "text-ink-soft border-accent/50 italic"
                      : "text-ink border-ink-faint"
                  }`}
              >
                {formatGBP(row.budgeted)}
              </button>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {row.type === "Pot" && row.carryIn !== 0 && (
              <span
                className={`pill ${
                  row.carryIn > 0
                    ? "bg-status-okSoft text-status-ok"
                    : "bg-status-overSoft text-status-over"
                }`}
                title="Carried in from previous month"
              >
                {row.carryIn > 0 ? "+" : "−"}
                {formatGBP(Math.abs(row.carryIn))} carried
              </span>
            )}
            {isPrefilled && row.budgeted > 0 && (
              <span className="pill bg-accent-soft text-accent">
                from {monthLabel(row.prefillSourceMonth!)}
              </span>
            )}
          </div>
        </div>

        {isPrefilled && row.budgeted > 0 && !availableNegative && (
          <p className="mt-2 text-[11px] text-ink-muted">
            Showing last month's budget — tap to confirm or change.
          </p>
        )}

        {availableNegative && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-status-over/20 bg-status-overSoft/40 px-3 py-2">
            <span className="text-[12px] text-status-over font-medium">
              {row.acknowledged
                ? "Overspend accepted."
                : `Over by ${formatGBP(-row.available)}`}
            </span>
            {!row.acknowledged && onResolveOverspend && (
              <button type="button" className="btn-accent btn-sm" onClick={onResolveOverspend}>
                Resolve
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
