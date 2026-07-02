import { useAppStore } from "../app/store.js";
import { monthLabel, nextMonth, prevMonth } from "../app/utils/month.js";
import { currentMonth } from "../app/state.js";

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MonthSwitcher() {
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setSelectedMonth = useAppStore((s) => s.setSelectedMonth);
  const isCurrent = month === currentMonth();
  const label = monthLabel(month);
  const [monthName, year] = label.split(" ");

  return (
    <div
      className="flex items-center justify-between gap-2 relative rounded-[18px]
        border border-surface-border/70 bg-surface-card/60 px-1.5 py-1.5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <button
        type="button"
        className="btn-icon !min-h-10 !min-w-10"
        onClick={() => setSelectedMonth(prevMonth(month))}
        aria-label="Previous month"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className="flex flex-col items-center min-w-0 px-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[19px] font-semibold tracking-tight text-ink">{monthName}</span>
          <span className="text-[13px] font-medium text-ink-muted tabular-nums">{year}</span>
        </div>
        {!isCurrent ? (
          <button
            type="button"
            onClick={() => setSelectedMonth(currentMonth())}
            className="text-[11px] font-semibold text-accent hover:underline underline-offset-2
              tracking-tight mt-0.5 inline-flex items-center gap-1"
          >
            <span aria-hidden="true">↺</span> Jump to current
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase
              tracking-[0.16em] text-accent mt-0.5 pulse-now"
          >
            <span
              className="w-1.5 h-1.5 rounded-full bg-status-ok"
              aria-hidden="true"
            />
            Now
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn-icon !min-h-10 !min-w-10"
        onClick={() => setSelectedMonth(nextMonth(month))}
        aria-label="Next month"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
