import { useState } from "react";
import type { OverspendRow } from "../app/derived.js";
import { useAppStore } from "../app/store.js";
import { ReallocationDialog } from "./ReallocationDialog.js";
import { formatGBP } from "../app/utils/money.js";

interface OverspendPromptProps {
  rows: OverspendRow[];
  month: string;
}

export function OverspendPrompt({ rows, month }: OverspendPromptProps) {
  const [openFor, setOpenFor] = useState<OverspendRow | null>(null);
  const goToBudget = useAppStore((s) => s.setSelectedScreen);

  if (rows.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-status-warn/30 bg-status-warnSoft/60 p-4"
      role="region"
      aria-label="Categories over budget"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {rows.length === 1
              ? `${rows[0]!.name} is ${formatGBP(rows[0]!.amount)} over this month.`
              : `${rows.length} categories are over budget this month.`}
          </h2>
          <p className="text-xs text-ink-soft mt-1">
            Where should that come from? Reallocate, cover from unallocated, or accept the
            overspend to dismiss this prompt.
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.categoryId} className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium text-ink">{r.name}</span>
              <span className="ml-2 text-status-over font-semibold">
                −{formatGBP(r.amount)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenFor(r)}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              Resolve
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 text-xs">
        <button
          type="button"
          className="text-status-info underline-offset-2 hover:underline"
          onClick={() => goToBudget("budget")}
        >
          See the Budget screen →
        </button>
      </div>

      <ReallocationDialog row={openFor} month={month} onClose={() => setOpenFor(null)} />
    </section>
  );
}
