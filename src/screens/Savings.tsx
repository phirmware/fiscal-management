import { useMemo, useState } from "react";
import { computeSavings } from "../engine.js";
import { savingsTrend } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { monthLabel, monthsBetween, nextMonth, prevMonth } from "../app/utils/month.js";
import type { Month } from "../types.js";
import { Modal } from "../components/Modal.js";
import { SavingsTrendChart } from "../components/SavingsTrendChart.js";

function addMonths(month: Month, delta: number): Month {
  let m = month;
  const step = delta > 0 ? nextMonth : prevMonth;
  for (let i = 0; i < Math.abs(delta); i++) m = step(m);
  return m;
}

export function SavingsScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const setSavingsEntry = useAppStore((s) => s.setSavingsEntry);
  const deleteSavingsEntry = useAppStore((s) => s.deleteSavingsEntry);
  const addSavingsAccount = useAppStore((s) => s.addSavingsAccount);

  const [trendRange, setTrendRange] = useState<6 | 12 | 24>(12);
  const trendFrom = addMonths(month, -(trendRange - 1));
  const trend = useMemo(
    () => savingsTrend(budget, trendFrom, month),
    [budget, trendFrom, month],
  );

  const thisMonth = useMemo(() => computeSavings(budget, month), [budget, month]);

  const [openAccount, setOpenAccount] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");

  function submitNewAccount() {
    const n = newName.trim();
    if (!n) return;
    addSavingsAccount({ name: n, startingBalance: parseMoneyInput(newStart) ?? 0 });
    setNewName("");
    setNewStart("");
    setOpenAccount(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">{monthLabel(month)} savings</h2>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <div className="text-xs text-ink-muted">This month</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatGBP(thisMonth.monthTotal)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-muted">Cumulative</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatGBP(thisMonth.cumulativeTotal)}
            </div>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">Accounts</h2>
          <button
            type="button"
            className="btn-secondary text-xs px-3 py-1.5"
            onClick={() => setOpenAccount(true)}
          >
            + Account
          </button>
        </div>
        {budget.savingsAccounts.length === 0 ? (
          <p className="text-xs text-ink-muted mt-2">
            No accounts yet. Add one to start tracking savings.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {budget.savingsAccounts.map((a) => {
              const entry = budget.savingsEntries.find(
                (e) => e.accountId === a.id && e.month === month,
              );
              return (
                <SavingsAccountCard
                  key={a.id}
                  accountId={a.id}
                  name={a.name}
                  startingBalance={a.startingBalance}
                  cumulative={thisMonth.cumulativeByAccount[a.id] ?? a.startingBalance}
                  entryAmount={entry?.amount ?? null}
                  onChange={(v) => {
                    if (v === null) deleteSavingsEntry(a.id, month);
                    else setSavingsEntry(a.id, month, v);
                  }}
                  month={month}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">
            Trend ({monthLabel(trendFrom)} – {monthLabel(month)})
          </h2>
          <div className="flex gap-1">
            {([6, 12, 24] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`text-xs px-2 py-1 rounded-lg ${
                  trendRange === n
                    ? "bg-ink text-white font-semibold"
                    : "bg-surface-sunken text-ink-muted"
                }`}
                onClick={() => setTrendRange(n)}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <SavingsTrendChart points={trend} />
        </div>
        <p className="text-xs text-ink-muted mt-2">
          Green bars: monthly contributions (above the line). Red bars: withdrawals.
          The line tracks cumulative balance across all accounts.
        </p>
      </section>

      <Modal
        open={openAccount}
        onClose={() => setOpenAccount(false)}
        title="New savings account"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpenAccount(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={submitNewAccount}
              disabled={!newName.trim()}
            >
              Add
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            <span className="block text-ink-soft mb-1">Name</span>
            <input
              autoFocus
              className="input-base"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Emergency fund"
            />
          </label>
          <label className="text-sm">
            <span className="block text-ink-soft mb-1">Starting balance (optional)</span>
            <input
              className="input-base"
              inputMode="decimal"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function SavingsAccountCard({
  accountId,
  name,
  startingBalance,
  cumulative,
  entryAmount,
  onChange,
  month,
}: {
  accountId: string;
  name: string;
  startingBalance: number;
  cumulative: number;
  entryAmount: number | null;
  onChange: (value: number | null) => void;
  month: Month;
}) {
  const [draft, setDraft] = useState<string>(entryAmount === null ? "" : String(entryAmount));
  const [dirty, setDirty] = useState(false);

  function commit() {
    if (!dirty) return;
    const v = parseMoneyInput(draft);
    if (draft.trim() === "") onChange(null);
    else if (v !== null) onChange(v);
    setDirty(false);
  }

  return (
    <li className="rounded-xl border border-surface-border p-3" key={accountId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-ink-muted tabular-nums">
          Balance {formatGBP(cumulative)}
        </span>
      </div>
      <label className="mt-2 block text-xs text-ink-muted">
        {monthLabel(month)} — contribution (or negative for withdrawal)
        <input
          className="input-base !py-1.5 !px-2 text-sm mt-1"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="0.00"
        />
      </label>
      <p className="text-xs text-ink-muted mt-1">
        Starting balance: {formatGBP(startingBalance)}
      </p>
    </li>
  );
}

// Re-export so other files can find this trivially.
export { monthsBetween };
