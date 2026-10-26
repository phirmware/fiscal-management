import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../app/store.js";
import type { AccountView } from "../app/wealth.js";
import { ASSET_CLASS_META, KIND_META } from "../app/wealth.js";
import { formatGBP, parseMoneyInput, roundMoney } from "../app/utils/money.js";
import { friendlyDayLabel, isValidIsoDate, todayIso } from "../app/utils/month.js";
import { Modal } from "./Modal.js";
import { showToast } from "./Toast.js";

/**
 * The monthly check-in: every active account on one sheet, prefilled with
 * its last balance so unchanged ones are a single tap to confirm.
 */
export function UpdateBalances({
  open,
  onClose,
  views,
}: {
  open: boolean;
  onClose: () => void;
  views: AccountView[];
}) {
  const recordBalance = useAppStore((s) => s.recordBalance);
  const active = useMemo(() => views.filter((v) => !v.account.archived), [views]);
  const [date, setDate] = useState(todayIso());
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDate(todayIso());
    const init: Record<string, string> = {};
    for (const v of active) init[v.account.id] = v.balance === null ? "" : String(v.balance);
    setValues(init);
    // Prefill once per opening — not on every store change while typing.
  }, [open]);

  /** Parsed input as it will be stored: liabilities are always positive amounts owed. */
  const storedValue = (v: AccountView): number | null => {
    const n = parseMoneyInput(values[v.account.id] ?? "");
    if (n === null) return null;
    return KIND_META[v.account.kind].liability ? Math.abs(n) : n;
  };

  let netChange = 0;
  for (const v of active) {
    const n = storedValue(v);
    if (n === null) continue;
    const delta = n - (v.balance ?? 0);
    netChange += KIND_META[v.account.kind].liability ? -delta : delta;
  }
  netChange = roundMoney(netChange);

  function save() {
    if (!isValidIsoDate(date)) return;
    let count = 0;
    for (const v of active) {
      const n = storedValue(v);
      if (n === null) continue;
      recordBalance({ accountId: v.account.id, date, balance: n });
      count++;
    }
    showToast(count === 0 ? "Nothing to save" : `${count} balance${count === 1 ? "" : "s"} updated`);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update balances"
      onSubmit={save}
      footer={
        <>
          <p className="mr-auto self-center text-[12px] text-ink-muted stat-num">
            Net worth {netChange >= 0 ? "+" : "−"}
            {formatGBP(Math.abs(netChange))}
          </p>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-accent">
            Save all
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-sunken/60 px-4 py-3">
        <label htmlFor="bulk-date" className="text-[13px] font-medium text-ink-soft">
          Balances as of
        </label>
        <input
          id="bulk-date"
          name="bulk-date"
          type="date"
          className="input-base !w-auto !py-1.5 !px-3 !text-[13px]"
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {active.some((v) => v.estimated) && (
        <p className="mt-3 text-[12px] text-ink-muted leading-snug">
          Some balances are prefilled with estimates from what you've logged. Replace them with what your bank shows —
          any difference is accepted as the new starting point.
        </p>
      )}
      <ul role="list" className="mt-3 divide-y divide-surface-border/70">
        {active.map((v) => {
          const meta = KIND_META[v.account.kind];
          const colourVar = meta.assetClass ? ASSET_CLASS_META[meta.assetClass].colourVar : "--c-debt";
          const raw = values[v.account.id] ?? "";
          const n = storedValue(v);
          const delta = n !== null && v.balance !== null ? roundMoney(n - v.balance) : null;
          return (
            <li key={v.account.id} className="flex items-center gap-3 py-3">
              <span className="size-2 rounded-full shrink-0" style={{ background: `rgb(var(${colourVar}))` }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <label htmlFor={`bal-${v.account.id}`} className="block truncate text-[14px] font-semibold text-ink">
                  {v.account.name}
                </label>
                <p className="truncate text-[11px] text-ink-muted">
                  {meta.liability ? "Owed · " : ""}
                  {v.estimated ? (
                    <span className="text-accent font-medium">
                      Estimated from {v.pending.length} {v.pending.length === 1 ? "entry" : "entries"}
                    </span>
                  ) : v.lastUpdated ? (
                    friendlyDayLabel(v.lastUpdated)
                  ) : (
                    "No balance yet"
                  )}
                  {delta !== null && delta !== 0 && (
                    <span className="stat-num text-status-warn">
                      {" · "}
                      {delta > 0 ? "+" : "−"}
                      {formatGBP(Math.abs(delta))} {v.estimated ? "vs estimate" : ""}
                    </span>
                  )}
                </p>
              </div>
              <div className="relative w-32 shrink-0">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted font-semibold pointer-events-none"
                  aria-hidden="true"
                >
                  £
                </span>
                <input
                  id={`bal-${v.account.id}`}
                  name={`bal-${v.account.id}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="input-base !py-2 !pl-7 !pr-3 text-right stat-num font-semibold !text-[14px]"
                  value={raw}
                  onChange={(e) => setValues((s) => ({ ...s, [v.account.id]: e.target.value }))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {active.length === 0 && <p className="text-[13px] text-ink-muted mt-3">No active accounts yet.</p>}
    </Modal>
  );
}
