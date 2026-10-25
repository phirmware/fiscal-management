import { useState } from "react";
import type { AssetClass } from "../app/wealth.js";
import { ASSET_CLASSES, ASSET_CLASS_META } from "../app/wealth.js";
import { formatGBP, formatGBPShort } from "../app/utils/money.js";

const SIZE = 148;
const STROKE = 20;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Where the assets sit, by class. Tap a legend row to spotlight a slice. */
export function AllocationDonut({ byClass }: { byClass: Record<AssetClass, number> }) {
  const [focus, setFocus] = useState<AssetClass | null>(null);
  const slices = ASSET_CLASSES.filter((k) => byClass[k] > 0).map((k) => ({ k, v: byClass[k] }));
  const total = slices.reduce((s, x) => s + x.v, 0);
  if (total <= 0) return null;

  // A small gap between slices reads cleaner than butted arcs.
  const gap = slices.length > 1 ? 2.5 : 0;
  let offset = 0;
  const focused = focus ? slices.find((s) => s.k === focus) : null;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgb(var(--c-surface-sunken))" strokeWidth={STROKE} />
          {slices.map((s) => {
            const len = (s.v / total) * C;
            const dash = Math.max(0.5, len - gap);
            const el = (
              <circle
                key={s.k}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={`rgb(var(${ASSET_CLASS_META[s.k].colourVar}))`}
                strokeWidth={focus === s.k ? STROKE + 4 : STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                opacity={focus && focus !== s.k ? 0.3 : 1}
                className="transition-[opacity,stroke-width] duration-200"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[11px] font-medium text-ink-muted">
            {focused ? ASSET_CLASS_META[focused.k].label : "Assets"}
          </p>
          <p className="text-[17px] font-semibold tracking-tight text-ink stat-num">
            {formatGBPShort(focused ? focused.v : total)}
          </p>
          {focused && (
            <p className="text-[11px] text-ink-muted stat-num">{Math.round((focused.v / total) * 100)}%</p>
          )}
        </div>
      </div>
      <ul role="list" className="flex-1 min-w-0 flex flex-col gap-1">
        {slices.map((s) => (
          <li key={s.k}>
            <button
              type="button"
              onClick={() => setFocus(focus === s.k ? null : s.k)}
              aria-pressed={focus === s.k}
              className={`w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition
                ${focus === s.k ? "bg-surface-sunken" : "hover:bg-surface-sunken/60"}`}
            >
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ background: `rgb(var(${ASSET_CLASS_META[s.k].colourVar}))` }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-ink">
                {ASSET_CLASS_META[s.k].label}
              </span>
              <span className="text-[12px] text-ink-muted stat-num" title={formatGBP(s.v)}>
                {Math.round((s.v / total) * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
