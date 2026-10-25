import { useEffect, useState } from "react";
import { useAppStore } from "../app/store.js";
import type { AccountView } from "../app/wealth.js";
import { ASSET_CLASS_META, KIND_META, projectPayoff } from "../app/wealth.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { addMonths, friendlyDayLabel, isValidIsoDate, monthLabel, todayIso } from "../app/utils/month.js";
import { MoneyField } from "./AccountForm.js";
import { Modal } from "./Modal.js";
import { Sparkline } from "./Sparkline.js";
import { showToast } from "./Toast.js";

function signed(n: number): string {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + formatGBP(Math.abs(n));
}

/** One account: balance history, quick update, and what the numbers imply. */
export function AccountDetail({
  view,
  onClose,
  onEdit,
}: {
  view: AccountView | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const recordBalance = useAppStore((s) => s.recordBalance);
  const deleteSnapshot = useAppStore((s) => s.deleteSnapshot);
  const updateAccount = useAppStore((s) => s.updateAccount);
  const deleteAccount = useAppStore((s) => s.deleteAccount);
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(todayIso());
  const [contribution, setContribution] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = view?.account.id;
  useEffect(() => {
    setBalance("");
    setContribution("");
    setDate(todayIso());
    setConfirmDelete(false);
    setError(null);
  }, [id]);

  if (!view) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const { account } = view;
  const meta = KIND_META[account.kind];
  const colourVar = meta.assetClass ? ASSET_CLASS_META[meta.assetClass].colourVar : "--c-debt";
  const tracksGrowth = account.kind === "investment" || account.kind === "pension" || account.kind === "crypto";

  function save() {
    const v = parseMoneyInput(balance);
    if (v === null) {
      setError("Enter a balance.");
      return;
    }
    if (!isValidIsoDate(date)) {
      setError("Pick a valid date.");
      return;
    }
    const c = parseMoneyInput(contribution);
    recordBalance({
      accountId: account.id,
      date,
      balance: meta.liability ? Math.abs(v) : v,
      contribution: tracksGrowth && c ? c : undefined,
    });
    showToast(`${account.name} updated`);
    setBalance("");
    setContribution("");
    setError(null);
  }

  const payoff =
    meta.liability && (view.balance ?? 0) > 0 && (account.monthlyPayment ?? 0) > 0
      ? projectPayoff(view.balance ?? 0, account.rate ?? 0, account.monthlyPayment ?? 0)
      : null;
  const utilisation =
    account.kind === "creditCard" && account.creditLimit ? (view.balance ?? 0) / account.creditLimit : null;
  const history = [...view.history].reverse();

  return (
    <Modal open onClose={onClose} title={account.name} onSubmit={save}>
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-surface-sunken/60 p-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: `rgb(var(${colourVar}))` }} aria-hidden="true" />
            <p className="text-[12px] font-semibold text-ink-muted">
              {meta.label}
              {account.archived && " · Archived"}
            </p>
          </div>
          <p className={`mt-2 text-display-md stat-num ${meta.liability ? "text-debt" : "text-ink"}`}>
            {view.balance === null ? "—" : (meta.liability && view.balance > 0 ? "−" : "") + formatGBP(Math.abs(view.balance))}
          </p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {view.lastUpdated ? `Updated ${friendlyDayLabel(view.lastUpdated).toLowerCase()}` : "No balance yet"}
            {view.change !== null && view.change !== 0 && (
              <span className="stat-num"> · {signed(view.change)} since previous</span>
            )}
          </p>
          {view.history.length > 1 && (
            <Sparkline
              values={view.history.map((h) => (meta.liability ? -h.balance : h.balance))}
              className="mt-3 w-full h-12"
            />
          )}
        </div>

        {(tracksGrowth && view.growth !== null) || payoff || utilisation !== null || account.rate ? (
          <dl className="grid grid-cols-2 gap-3">
            {tracksGrowth && view.growth !== null && (
              <>
                <Stat label="Paid in" value={formatGBP(view.contributed)} />
                <Stat
                  label="Growth"
                  value={signed(view.growth)}
                  tone={view.growth >= 0 ? "ok" : "over"}
                />
              </>
            )}
            {utilisation !== null && (
              <Stat
                label="Utilisation"
                value={`${Math.round(utilisation * 100)}%`}
                tone={utilisation >= 0.5 ? "over" : utilisation >= 0.3 ? "warn" : "ok"}
              />
            )}
            {account.rate !== undefined && account.rate > 0 && (
              <Stat label={meta.liability ? "APR" : "Rate"} value={`${account.rate}%`} />
            )}
            {payoff && (
              <>
                <Stat
                  label="Debt-free"
                  value={payoff.months === null ? "Never" : monthLabel(addMonths(todayIso().slice(0, 7), payoff.months))}
                  tone={payoff.months === null ? "over" : undefined}
                />
                <Stat
                  label="Interest to go"
                  value={payoff.totalInterest === null ? "∞" : formatGBP(payoff.totalInterest)}
                />
              </>
            )}
          </dl>
        ) : null}

        <div className="flex flex-col gap-3">
          <p className="section-title">Update balance</p>
          <div className="grid grid-cols-[3fr_2fr] gap-2">
            <MoneyField
              id="detail-balance"
              label={meta.liability ? "Amount owed" : "Balance"}
              value={balance}
              onChange={setBalance}
              placeholder={view.balance !== null ? String(view.balance) : "0"}
            />
            <div>
              <label htmlFor="detail-date" className="block text-[13px] font-medium text-ink-soft mb-1.5">
                As of
              </label>
              <input
                id="detail-date"
                name="detail-date"
                type="date"
                className="input-base !px-3"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          {tracksGrowth && (
            <MoneyField
              id="detail-contribution"
              label="Paid in since last update"
              value={contribution}
              onChange={setContribution}
              hint="Optional. Separates your deposits from market growth."
            />
          )}
          {error && <p className="text-[12px] font-medium text-status-over">{error}</p>}
          <button type="submit" className="btn-accent">
            Save balance
          </button>
        </div>

        {history.length > 0 && (
          <div>
            <p className="section-title mb-2">History</p>
            <ul role="list" className="divide-y divide-surface-border/70 rounded-2xl border border-surface-border">
              {history.slice(0, 24).map((h, i) => {
                const prev = history[i + 1];
                const delta = prev ? h.balance - prev.balance : null;
                return (
                  <li key={h.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">{friendlyDayLabel(h.date)}</p>
                      {h.contribution ? (
                        <p className="text-[11px] text-ink-muted stat-num">+{formatGBP(h.contribution)} paid in</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold text-ink stat-num">{formatGBP(h.balance)}</p>
                      {delta !== null && delta !== 0 && (
                        <p className="text-[11px] text-ink-muted stat-num">{signed(delta)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-icon !min-h-8 !min-w-8 text-ink-faint hover:text-status-over"
                      aria-label={`Delete balance from ${h.date}`}
                      onClick={() => deleteSnapshot(h.id)}
                    >
                      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                        <path d="M4 4l8 8M12 4L4 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>
            Edit details
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              updateAccount(account.id, { archived: !account.archived });
              showToast(account.archived ? "Account restored" : "Account archived");
            }}
          >
            {account.archived ? "Restore" : "Archive"}
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="btn-danger btn-sm ml-auto"
              onClick={() => {
                deleteAccount(account.id);
                showToast(`${account.name} deleted`);
                onClose();
              }}
            >
              Delete forever?
            </button>
          ) : (
            <button type="button" className="btn-ghost btn-sm ml-auto text-status-over" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink-muted leading-snug -mt-2">
          Closed an account? Record a £0 balance and archive it — your net worth history stays accurate.
        </p>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "over" }) {
  const toneClass =
    tone === "ok" ? "text-status-ok" : tone === "warn" ? "text-status-warn" : tone === "over" ? "text-status-over" : "text-ink";
  return (
    <div className="rounded-2xl border border-surface-border px-3.5 py-3">
      <dt className="truncate text-[11px] font-semibold text-ink-muted">{label}</dt>
      <dd className={`mt-1 text-[15px] font-semibold stat-num ${toneClass}`}>{value}</dd>
    </div>
  );
}
