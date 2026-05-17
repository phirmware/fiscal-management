import type { StatusBucket } from "../app/derived.js";

interface ProgressBarProps {
  used: number;
  total: number;
  status: StatusBucket;
}

const COLOURS: Record<StatusBucket, string> = {
  ok: "bg-status-ok",
  close: "bg-status-warn",
  over: "bg-status-over",
  empty: "bg-ink-faint",
};

export function ProgressBar({ used, total, status }: ProgressBarProps) {
  const pct = total <= 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.max(0, (used / total) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden">
      <div
        className={`h-full ${COLOURS[status]} rounded-full transition-[width] duration-500 ease-out`}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
