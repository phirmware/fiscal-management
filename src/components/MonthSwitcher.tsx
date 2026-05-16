import { useAppStore } from "../app/store.js";
import { monthLabel, nextMonth, prevMonth } from "../app/utils/month.js";
import { currentMonth } from "../app/state.js";

export function MonthSwitcher() {
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setSelectedMonth = useAppStore((s) => s.setSelectedMonth);
  const isCurrent = month === currentMonth();

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        className="tap p-2 rounded-xl hover:bg-surface-sunken text-ink-muted"
        onClick={() => setSelectedMonth(prevMonth(month))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <div className="flex flex-col items-center">
        <span className="text-base font-semibold">{monthLabel(month)}</span>
        {!isCurrent && (
          <button
            type="button"
            onClick={() => setSelectedMonth(currentMonth())}
            className="text-xs text-status-info underline-offset-2 hover:underline"
          >
            Jump to current
          </button>
        )}
      </div>
      <button
        type="button"
        className="tap p-2 rounded-xl hover:bg-surface-sunken text-ink-muted"
        onClick={() => setSelectedMonth(nextMonth(month))}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
