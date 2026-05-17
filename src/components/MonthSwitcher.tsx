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
    <div className="flex items-center justify-between gap-2 relative">
      <button
        type="button"
        className="btn-icon"
        onClick={() => setSelectedMonth(prevMonth(month))}
        aria-label="Previous month"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className="flex flex-col items-center min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[19px] font-semibold tracking-tight text-ink">{monthName}</span>
          <span className="text-[13px] font-medium text-ink-muted tabular-nums">{year}</span>
        </div>
        {!isCurrent ? (
          <button
            type="button"
            onClick={() => setSelectedMonth(currentMonth())}
            className="text-[11px] font-medium text-accent hover:underline underline-offset-2
              tracking-tight mt-0.5"
          >
            Jump to current
          </button>
        ) : (
          <span
            className="text-[10px] font-semibold text-accent tracking-widest uppercase
              mt-0.5"
          >
            Now
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setSelectedMonth(nextMonth(month))}
        aria-label="Next month"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
