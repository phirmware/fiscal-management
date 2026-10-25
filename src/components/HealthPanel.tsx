import { useState } from "react";
import type { FlagSeverity, HealthFlag, HealthMetric, MetricStatus } from "../app/wealth.js";

const STATUS: Record<MetricStatus, { label: string; colourVar: string }> = {
  good: { label: "Strong", colourVar: "--c-status-ok" },
  ok: { label: "Fair", colourVar: "--c-status-info" },
  warn: { label: "Watch", colourVar: "--c-status-warn" },
  bad: { label: "Act now", colourVar: "--c-status-over" },
  neutral: { label: "Progress", colourVar: "--c-accent" },
  na: { label: "Needs data", colourVar: "--c-ink-faint" },
};

const SEVERITY: Record<FlagSeverity, { label: string; colourVar: string }> = {
  critical: { label: "Red flag", colourVar: "--c-status-over" },
  warning: { label: "Worth a look", colourVar: "--c-status-warn" },
  info: { label: "Tip", colourVar: "--c-status-info" },
  win: { label: "Win", colourVar: "--c-status-ok" },
};

function SeverityIcon({ severity, className }: { severity: FlagSeverity; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {severity === "win" ? (
        <path {...common} d="m5 10.5 3 3 7-7" />
      ) : severity === "info" ? (
        <path {...common} d="M10 9v5M10 6h.01" />
      ) : (
        <path {...common} d="M10 5.5v5.5M10 14.5h.01" />
      )}
    </svg>
  );
}

export function scoreLabel(score: number): { label: string; colourVar: string } {
  if (score >= 80) return { label: "Strong", colourVar: "--c-status-ok" };
  if (score >= 60) return { label: "Steady", colourVar: "--c-status-info" };
  if (score >= 40) return { label: "Needs attention", colourVar: "--c-status-warn" };
  return { label: "At risk", colourVar: "--c-status-over" };
}

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const { colourVar } = scoreLabel(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-surface-sunken))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`rgb(var(${colourVar}))`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          className="bar-anim"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[18px] font-semibold tracking-tight text-ink stat-num">{score}</p>
      </div>
    </div>
  );
}

export function FlagList({ flags, limit }: { flags: HealthFlag[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? flags.slice(0, limit) : flags;
  if (flags.length === 0) return null;
  return (
    <div>
      <ul role="list" className="flex flex-col gap-2">
        {shown.map((f) => {
          const sev = SEVERITY[f.severity];
          return (
            <li
              key={f.id}
              className="flex gap-3 rounded-2xl border p-3.5"
              style={{
                background: `rgb(var(${sev.colourVar}) / 0.06)`,
                borderColor: `rgb(var(${sev.colourVar}) / 0.22)`,
              }}
            >
              <span
                className="mt-0.5 size-6 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `rgb(var(${sev.colourVar}) / 0.16)`, color: `rgb(var(${sev.colourVar}))` }}
              >
                <SeverityIcon severity={f.severity} className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[14px] font-semibold tracking-tight text-ink">{f.title}</p>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ color: `rgb(var(${sev.colourVar}))` }}
                  >
                    {sev.label}
                  </p>
                </div>
                <p className="mt-1 text-[12px] text-ink-soft leading-snug text-pretty">{f.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {limit && flags.length > limit && (
        <button
          type="button"
          className="mt-2 text-[12px] font-semibold text-accent hover:underline underline-offset-2"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show fewer" : `Show ${flags.length - limit} more`}
        </button>
      )}
    </div>
  );
}

export function MetricList({ metrics }: { metrics: HealthMetric[] }) {
  return (
    <ul role="list" className="divide-y divide-surface-border/70">
      {metrics.map((m) => {
        const st = STATUS[m.status];
        return (
          <li key={m.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-tight text-ink">{m.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">Target: {m.target}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[17px] font-semibold tracking-tight text-ink stat-num">{m.value}</p>
                <p
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{ color: `rgb(var(${st.colourVar}))` }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: `rgb(var(${st.colourVar}))` }} aria-hidden="true" />
                  {st.label}
                </p>
              </div>
            </div>
            {m.progress !== null && (
              <div className="mt-2 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full rounded-full bar-anim"
                  style={{ width: `${Math.max(2, m.progress * 100)}%`, background: `rgb(var(${st.colourVar}))` }}
                />
              </div>
            )}
            <p className="mt-2 text-[12px] text-ink-soft leading-snug text-pretty">{m.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
