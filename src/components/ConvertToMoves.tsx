import { useEffect, useMemo, useState } from "react";
import { planConversion, useAppStore } from "../app/store.js";
import type { ConvertInput } from "../app/store.js";
import { KIND_META } from "../app/wealth.js";
import { formatGBP, roundMoney } from "../app/utils/money.js";
import { monthLabel, parseIsoDateLocal } from "../app/utils/month.js";
import { Modal } from "./Modal.js";
import { Select } from "./Select.js";
import { showToast } from "./Toast.js";

function shortDate(iso: string): string {
  const d = parseIsoDateLocal(iso);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : iso;
}

/**
 * Turns spending that was really money set aside (e.g. daily birthday
 * savings logged against Gifts) into moves, across every month at once.
 * Shows exactly what will change before anything is touched, and can be undone.
 */
export function ConvertToMoves({
  open,
  onClose,
  initialCategoryId,
}: {
  open: boolean;
  onClose: () => void;
  initialCategoryId: string | null;
}) {
  const state = useAppStore((s) => s);
  const convert = useAppStore((s) => s.convertToMoves);
  const undo = useAppStore((s) => s.undoConvert);
  const { categories, transactions } = state.budget;
  const accounts = state.wealth.accounts;
  const active = categories.filter((c) => !c.archived);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Deleted category";
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";

  const [sourceCat, setSourceCat] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [budgetFrom, setBudgetFrom] = useState("");
  const [toAccount, setToAccount] = useState("");

  useEffect(() => {
    if (!open) return;
    setSourceCat(initialCategoryId ?? active[0]?.id ?? "");
    setQuery("");
    setTarget("");
    setBudgetFrom("");
    setToAccount("");
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => t.categoryId === sourceCat && t.amount > 0 && (!q || (t.note ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.loggedAt ?? 0) - (a.loggedAt ?? 0)));
  }, [transactions, sourceCat, query]);

  // Changing the filter selects everything that matches; untick what shouldn't move.
  useEffect(() => {
    setSelected(new Set(matches.map((t) => t.id)));
  }, [matches]);

  const chosen = matches.filter((t) => selected.has(t.id));
  const needsBudgetFrom = chosen.some((t) => t.categoryId === target);
  const paidFromAccounts = [...new Set(chosen.flatMap((t) => (t.accountId ? [t.accountId] : [])))];

  const input: ConvertInput = {
    transactionIds: chosen.map((t) => t.id),
    toCategoryId: target,
    ...(needsBudgetFrom && budgetFrom ? { fromCategoryId: budgetFrom } : {}),
    ...(toAccount ? { toAccountId: toAccount } : {}),
  };
  const plan = useMemo(
    () => (target && chosen.length > 0 ? planConversion(state, input, () => "preview") : null),
    [state, target, budgetFrom, toAccount, selected, matches],
  );
  const ok = plan !== null && typeof plan !== "string";

  function run() {
    if (!ok) return;
    const r = convert(input);
    if (!r) return showToast("Couldn't convert — nothing was changed");
    const n = r.removed.length;
    showToast(`${n} ${n === 1 ? "entry" : "entries"} converted · ${formatGBP(plan.total)} to ${catName(target)}`, {
      actionLabel: "Undo",
      onAction: () => undo(r),
    });
    onClose();
  }

  // Group the list by month so long histories stay scannable.
  const byMonth = new Map<string, typeof matches>();
  for (const t of matches) {
    const m = t.date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
  }
  const allOn = matches.length > 0 && chosen.length === matches.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert to moves"
      onSubmit={run}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-accent" disabled={!ok}>
            Convert {chosen.length > 0 ? chosen.length : ""}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-ink-muted leading-snug">
          For spending that was really money set aside. Each entry becomes a move on the same date for the same
          amount — it stops counting as spending and the money builds up in the category you choose.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Logged in</span>
            <Select value={sourceCat} onChange={(e) => setSourceCat(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? " (archived)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Note contains</span>
            <input
              className="input-base"
              name="convert-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-[13px] font-medium text-ink-soft">
              {chosen.length} of {matches.length} selected
              {chosen.length > 0 && (
                <span className="stat-num"> · {formatGBP(roundMoney(chosen.reduce((s, t) => s + t.amount, 0)))}</span>
              )}
            </span>
            {matches.length > 0 && (
              <button
                type="button"
                className="text-[12px] font-medium text-accent hover:underline underline-offset-2"
                onClick={() => setSelected(allOn ? new Set() : new Set(matches.map((t) => t.id)))}
              >
                {allOn ? "Select none" : "Select all"}
              </button>
            )}
          </div>
          {matches.length === 0 ? (
            <p className="rounded-2xl bg-surface-sunken/60 px-4 py-3 text-[12px] text-ink-muted">
              No spending logged in {catName(sourceCat)}
              {query.trim() ? ` with “${query.trim()}” in the note` : ""}.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-2xl border border-surface-border">
              {[...byMonth].map(([m, list]) => (
                <div key={m}>
                  <div className="sticky top-0 bg-surface-card/95 backdrop-blur px-4 py-1.5 text-[11px] font-semibold text-ink-muted border-b border-surface-border/60">
                    {monthLabel(m)}
                  </div>
                  {list.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-border/40 last:border-b-0 cursor-pointer hover:bg-surface-sunken/40"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[rgb(var(--c-accent))]"
                        checked={selected.has(t.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(t.id);
                          else next.delete(t.id);
                          setSelected(next);
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink truncate">
                          {t.note?.trim() || catName(t.categoryId)}
                        </span>
                        <span className="block text-[11px] text-ink-muted truncate">
                          {shortDate(t.date)}
                          {t.accountId ? ` · ${accountName(t.accountId)}` : ""}
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold stat-num text-ink whitespace-nowrap">
                        {formatGBP(t.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Move into</span>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="" disabled>
              Choose…
            </option>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>

        {needsBudgetFrom && (
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Take the budget from</span>
            <Select value={budgetFrom} onChange={(e) => setBudgetFrom(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {active
                .filter((c) => c.id !== target)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <span className="block text-[12px] text-ink-muted mt-1.5 leading-snug">
              These entries were logged in {catName(target)} itself, so they need a category to come from.
            </span>
          </label>
        )}

        {paidFromAccounts.length > 0 && (
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Where did the money go?</span>
            <Select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="">Nowhere — budget only</option>
              {accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {KIND_META[a.kind].label}
                  </option>
                ))}
            </Select>
            <span className="block text-[12px] text-ink-muted mt-1.5 leading-snug">
              Some entries were paid from {paidFromAccounts.map(accountName).join(", ")}. Pick the account the money
              went into to record it as a transfer.
            </span>
          </label>
        )}

        {plan !== null && (
          <div
            className={`rounded-2xl px-4 py-3 text-[12px] leading-snug ${
              ok ? "bg-accent/10 text-ink-soft" : "bg-status-overSoft/50 text-status-over font-medium"
            }`}
          >
            {!ok ? (
              plan
            ) : (
              <ul role="list" className="flex flex-col gap-1">
                <li>
                  <span className="font-semibold text-ink stat-num">{formatGBP(plan.total)}</span> moves into{" "}
                  {catName(target)} across {new Set(plan.moves.map((m) => m.date.slice(0, 7))).size}{" "}
                  {new Set(plan.moves.map((m) => m.date.slice(0, 7))).size === 1 ? "month" : "months"}, and stops
                  counting as spending. Each source category keeps the same amount available.
                </li>
                {plan.extendTo && (
                  <li>
                    {catName(target)} will start from {monthLabel(plan.extendTo)} so the earlier entries can land in
                    it.
                  </li>
                )}
                {[...plan.restored].map(([id, amt]) => (
                  <li key={id}>
                    {accountName(id)}'s balance goes back up by{" "}
                    <span className="font-semibold stat-num">{formatGBP(amt)}</span>, since no destination account is
                    set.
                  </li>
                ))}
                {plan.moves.some((m) => m.fromAccountId) && (
                  <li>
                    Recorded as transfers to {accountName(toAccount)} — net worth doesn't change.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
