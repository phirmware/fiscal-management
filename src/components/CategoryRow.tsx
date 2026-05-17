import { useState } from "react";
import type { CategoryRow as CategoryRowData } from "../app/derived.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { useAppStore } from "../app/store.js";
import { monthLabel } from "../app/utils/month.js";
import { ProgressBar } from "./ProgressBar.js";

const STATUS_TAG_CLASSES: Record<string, string> = {
  ok: "bg-status-okSoft text-status-ok",
  close: "bg-status-warnSoft text-status-warn",
  over: "bg-status-overSoft text-status-over",
  empty: "bg-surface-sunken text-ink-muted",
};

const GROUP_DOT: Record<string, string> = {
  Needs: "bg-group-needs",
  Wants: "bg-group-wants",
  Savings: "bg-group-savings",
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

  function startEdit() {
    setDraft(row.budgeted > 0 ? String(row.budgeted) : "");
    setEditing(true);
  }

  function commit() {
    const v = parseMoneyInput(draft);
    if (v !== null) setBudget(row.categoryId, month, v);
    setEditing(false);
  }

  const reference = row.type === "Pot" ? row.budgeted + row.carryIn : row.budgeted;
  const statusLabel =
    row.status === "over" ? "Over" : row.status === "close" ? "Close" : row.status === "ok" ? "On track" : "—";

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${GROUP_DOT[row.group] ?? ""}`}
              aria-hidden="true"
            />
            <h3 className="text-[15px] font-semibold tracking-tight text-ink truncate">
              {row.name}
            </h3>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="pill bg-surface-sunken text-ink-muted">{row.type}</span>
            <span className="pill bg-surface-sunken text-ink-muted">{row.group}</span>
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
              <span
                className="pill bg-status-infoSoft text-status-info"
                title={`Prefilled from ${monthLabel(row.prefillSourceMonth!)}`}
              >
                from {monthLabel(row.prefillSourceMonth!)}
              </span>
            )}
          </div>
        </div>
        <span className={`pill-lg ${STATUS_TAG_CLASSES[row.status] ?? ""}`}>{statusLabel}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="section-eyebrow">Budgeted</div>
          {editing ? (
            <input
              className="input-base !py-1.5 !px-2 !text-[15px] !font-semibold mt-1 w-full"
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
              className="mt-1 text-[15px] font-semibold text-status-info hover:underline
                underline-offset-2 focus-ring rounded"
              onClick={startEdit}
            >
              Set budget
            </button>
          ) : (
            <button
              type="button"
              className={`mt-1 text-[15px] font-semibold stat-num border-b border-dashed
                focus-ring rounded ${
                  isPrefilled
                    ? "text-ink-soft border-status-info/50 italic"
                    : "text-ink border-ink-faint"
                }`}
              onClick={startEdit}
            >
              {formatGBP(row.budgeted)}
            </button>
          )}
        </div>
        <div>
          <div className="section-eyebrow">Spent</div>
          <div className="mt-1 text-[15px] font-semibold stat-num text-ink">
            {formatGBP(row.spent)}
          </div>
        </div>
        <div>
          <div className="section-eyebrow">Available</div>
          <div
            className={`mt-1 text-[15px] font-semibold stat-num ${
              row.available < 0 ? "text-status-over" : "text-ink"
            } ${isPrefilled ? "italic text-ink-soft" : ""}`}
          >
            {row.available < 0 ? "−" : ""}
            {formatGBP(Math.abs(row.available))}
          </div>
        </div>
      </div>

      <ProgressBar used={row.spent} total={reference} status={row.status} />

      {isPrefilled && row.budgeted > 0 && (
        <p className="text-[11px] text-ink-muted">
          Showing last month's budget. Tap to confirm or change for {monthLabel(month)}.
        </p>
      )}

      {row.available < 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-status-over font-medium">
            {row.acknowledged
              ? "Overspend accepted."
              : `Over by ${formatGBP(-row.available)}.`}
          </span>
          {!row.acknowledged && onResolveOverspend && (
            <button type="button" className="btn-secondary btn-sm" onClick={onResolveOverspend}>
              Resolve
            </button>
          )}
        </div>
      )}
    </div>
  );
}
