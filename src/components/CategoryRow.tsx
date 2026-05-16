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

const GROUP_CLASSES: Record<string, string> = {
  Needs: "bg-group-needs/10 text-group-needs",
  Wants: "bg-group-wants/10 text-group-wants",
  Savings: "bg-group-savings/10 text-group-savings",
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

  return (
    <div className="card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-ink truncate">{row.name}</h3>
            <span className={`pill ${GROUP_CLASSES[row.group] ?? ""}`}>{row.group}</span>
            <span className="pill bg-surface-sunken text-ink-muted">{row.type}</span>
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
                title={`Prefilled from ${monthLabel(row.prefillSourceMonth!)} — tap the budget to confirm or change it.`}
              >
                from {monthLabel(row.prefillSourceMonth!)}
              </span>
            )}
          </div>
        </div>
        <div className={`pill ${STATUS_TAG_CLASSES[row.status] ?? ""}`}>
          {row.status === "over" ? "Over" : row.status === "close" ? "Close" : "OK"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-ink-muted">Budgeted</div>
          {editing ? (
            <input
              className="input-base !py-1 !px-2 text-sm w-full"
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
              className="tap text-status-info font-semibold underline underline-offset-2"
              onClick={startEdit}
            >
              Set budget
            </button>
          ) : (
            <button
              type="button"
              className={`tap font-semibold border-b border-dashed ${
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
          <div className="text-ink-muted">Spent</div>
          <div className="font-semibold">{formatGBP(row.spent)}</div>
        </div>
        <div>
          <div className="text-ink-muted">Available</div>
          <div
            className={`font-semibold ${
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
        <p className="text-xs text-ink-muted">
          Showing last month's budget. Tap to confirm or change for {monthLabel(month)}.
        </p>
      )}

      {row.available < 0 && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs text-status-over">
            {row.acknowledged
              ? "Overspend accepted."
              : `Over by ${formatGBP(-row.available)}.`}
          </span>
          {!row.acknowledged && onResolveOverspend && (
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-1"
              onClick={onResolveOverspend}
            >
              Resolve
            </button>
          )}
        </div>
      )}
    </div>
  );
}
