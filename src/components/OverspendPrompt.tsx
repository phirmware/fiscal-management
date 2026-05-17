import { useState } from "react";
import type { OverspendRow } from "../app/derived.js";
import { useAppStore } from "../app/store.js";
import { ReallocationDialog } from "./ReallocationDialog.js";
import { formatGBP } from "../app/utils/money.js";

interface OverspendPromptProps {
  rows: OverspendRow[];
  month: string;
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M12 7v6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function OverspendPrompt({ rows, month }: OverspendPromptProps) {
  const [openFor, setOpenFor] = useState<OverspendRow | null>(null);
  const goToBudget = useAppStore((s) => s.setSelectedScreen);

  if (rows.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-status-warn/30 bg-status-warnSoft/50 p-4"
      role="region"
      aria-label="Categories over budget"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full bg-status-warn/15 text-status-warn
            flex items-center justify-center"
        >
          <AlertIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-ink tracking-tight">
            {rows.length === 1
              ? `${rows[0]!.name} is ${formatGBP(rows[0]!.amount)} over this month.`
              : `${rows.length} categories are over budget this month.`}
          </h2>
          <p className="text-[12px] text-ink-soft mt-1 leading-snug">
            Reallocate from another category, cover from unallocated, or accept the overspend
            to dismiss this prompt.
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li
            key={r.categoryId}
            className="flex items-center justify-between gap-2 rounded-xl bg-surface-card/50
              border border-status-warn/15 px-3 py-2"
          >
            <div className="text-[13px] min-w-0">
              <span className="font-medium text-ink truncate">{r.name}</span>
              <span className="ml-2 stat-num text-status-over font-semibold">
                −{formatGBP(r.amount)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenFor(r)}
              className="btn-secondary btn-sm"
            >
              Resolve
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 text-[12px]">
        <button
          type="button"
          className="font-medium text-status-info hover:underline underline-offset-2"
          onClick={() => goToBudget("budget")}
        >
          See the Budget screen →
        </button>
      </div>

      <ReallocationDialog row={openFor} month={month} onClose={() => setOpenFor(null)} />
    </section>
  );
}
