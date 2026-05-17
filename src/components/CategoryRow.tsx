import { useState } from "react";
import type { CategoryRow as CategoryRowData } from "../app/derived.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { useAppStore } from "../app/store.js";
import { monthLabel } from "../app/utils/month.js";

const GROUP_BG: Record<string, string> = {
  Needs: "bg-group-needs",
  Wants: "bg-group-wants",
  Savings: "bg-group-savings",
};

const STATUS_DOT: Record<string, string> = {
  ok: "bg-status-ok",
  close: "bg-status-warn",
  over: "bg-status-over",
  empty: "bg-ink-faint",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "On track",
  close: "Close",
  over: "Over",
  empty: "Empty",
};

const BAR_COLOR: Record<string, string> = {
  ok: "bg-status-ok",
  close: "bg-status-warn",
  over: "bg-status-over",
  empty: "bg-ink-faint",
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
  const usedPct =
    reference <= 0 ? (row.spent > 0 ? 100 : 0) : Math.min(100, (row.spent / reference) * 100);
  const groupSpine = GROUP_BG[row.group] ?? "bg-ink-faint";

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

  return (
    <div className="relative card overflow-hidden">
      {/* Group spine */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${groupSpine}`}
        aria-hidden="true"
      />

      <div className="pl-5 pr-4 py-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink truncate">
              {row.name}
            </h3>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              {row.type} · {row.group}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[row.status] ?? ""}`}
              aria-hidden="true"
            />
            <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
              {STATUS_LABEL[row.status] ?? ""}
            </span>
          </div>
        </div>

        {/* Hero: available amount */}
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
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
        </div>

        {/* Progress bar — the visual story */}
        <div className="mt-3 relative h-2 rounded-full bg-surface-sunken overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
              BAR_COLOR[row.status] ?? "bg-ink-faint"
            }`}
            style={{ width: `${usedPct}%` }}
            aria-hidden="true"
          />
          {/* Subtle inner highlight on the bar fill */}
          {usedPct > 0 && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, rgb(255 255 255 / 0.18), rgb(255 255 255 / 0) 50%)",
                width: `${usedPct}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Footer: spent / budgeted with editable budget */}
        <div className="mt-3 flex items-baseline justify-between gap-2 text-[12px]">
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
          {isPrefilled && row.budgeted > 0 && (
            <span className="pill bg-accent-soft text-accent">
              from {monthLabel(row.prefillSourceMonth!)}
            </span>
          )}
        </div>

        {availableNegative && (
          <div className="mt-3 pt-3 border-t border-status-over/15 flex items-center justify-between gap-2">
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

        {isPrefilled && row.budgeted > 0 && !availableNegative && (
          <p className="mt-2 text-[11px] text-ink-muted">
            Showing last month's budget — tap to confirm or change.
          </p>
        )}
      </div>
    </div>
  );
}
