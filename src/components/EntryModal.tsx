import { useEffect, useMemo, useState } from "react";
import { computeMonth } from "../engine.js";
import type { Category, Transaction } from "../types.js";
import type { BudgetMove, IncomeMovement, IncomeSource, Movement, RecurringRule, RecurringTemplate } from "../app/state.js";
import { allReallocations, movementAccountIds } from "../app/state.js";
import { ordinal } from "../app/recurring.js";
import { categoryRows } from "../app/derived.js";
import { makeEffectiveBudget } from "../app/effectiveBudget.js";
import { useAppStore } from "../app/store.js";
import type { MoveInput, MovementInput } from "../app/store.js";
import { KIND_META, accountViews } from "../app/wealth.js";
import { formatGBP, parseMoneyInput, roundMoney } from "../app/utils/money.js";
import { addMonths, isValidIsoDate, monthLabel, todayIso } from "../app/utils/month.js";
import { Modal } from "./Modal.js";
import { Select } from "./Select.js";
import { showToast } from "./Toast.js";

export type EntryKind = "spend" | "income" | "transfer" | "expense" | "move";
/** Opening the sheet from a repeating-entry reminder. */
export type Prefill = { rule: RecurringRule; date: string; amount: number | null };

const KIND_LABEL: Record<EntryKind, string> = {
  spend: "Spend",
  income: "Income",
  transfer: "Transfer",
  expense: "Off-budget",
  move: "Move",
};
export type EditTarget =
  | { kind: "spend"; t: Transaction }
  | { kind: "movement"; m: Movement }
  | { kind: "move"; mv: BudgetMove }
  | null;

type BudgetChoice = "same" | "next" | "none";

function choiceFor(m: IncomeMovement): BudgetChoice {
  if (!m.budgetMonth) return "none";
  return m.budgetMonth === m.date.slice(0, 7) ? "same" : "next";
}

function MoneyInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted text-lg font-semibold pointer-events-none"
        aria-hidden="true"
      >
        £
      </span>
      <input
        type="text"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        className="input-base !pl-7 text-xl font-semibold stat-num"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        autoFocus={autoFocus}
        aria-label="Amount"
      />
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-ink-muted mt-1.5 leading-snug">{hint}</span>}
    </label>
  );
}

/**
 * One sheet for every money movement. Spending feeds the budget (and, with
 * "paid with", that account's balance); income and transfers only touch
 * accounts — except salary, which also sets the budget month's income.
 */
export function EntryModal({
  open,
  onClose,
  editing,
  month,
  categories,
  defaultCategoryId,
  initialKind = "spend",
  prefill = null,
}: {
  open: boolean;
  onClose: () => void;
  editing: EditTarget;
  month: string;
  categories: Category[];
  defaultCategoryId: string | null;
  initialKind?: EntryKind;
  prefill?: Prefill | null;
}) {
  const wealth = useAppStore((s) => s.wealth);
  const transactions = useAppStore((s) => s.budget.transactions);
  const lastAccountId = useAppStore((s) => s.ui.lastUsedAccountId);
  const addTxn = useAppStore((s) => s.addTransaction);
  const editTxn = useAppStore((s) => s.editTransaction);
  const deleteTxn = useAppStore((s) => s.deleteTransaction);
  const addMovement = useAppStore((s) => s.addMovement);
  const editMovement = useAppStore((s) => s.editMovement);
  const deleteMovement = useAppStore((s) => s.deleteMovement);
  const addRecurring = useAppStore((s) => s.addRecurring);
  const addMove = useAppStore((s) => s.addMove);
  const editMove = useAppStore((s) => s.editMove);
  const deleteMove = useAppStore((s) => s.deleteMove);
  const baselineBudget = useAppStore((s) => s.budget);
  const reallocations = useAppStore((s) => s.reallocations);

  const editingKind: EntryKind | null =
    editing?.kind === "spend"
      ? "spend"
      : editing?.kind === "movement"
        ? editing.m.type
        : editing?.kind === "move"
          ? "move"
          : null;

  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [source, setSource] = useState<IncomeSource>("salary");
  const [budgetChoice, setBudgetChoice] = useState<BudgetChoice>("same");
  const [error, setError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [payFull, setPayFull] = useState(false);
  const [fromCatId, setFromCatId] = useState("");
  const [toCatId, setToCatId] = useState("");
  const [moveAccounts, setMoveAccounts] = useState(false);

  const activeCategories = categories.filter((c) => !c.archived);
  const accountsById = useMemo(() => new Map(wealth.accounts.map((a) => [a.id, a])), [wealth.accounts]);
  // Archived accounts stay selectable only if the entry being edited already uses one.
  const usedIds = new Set<string>();
  if (editing?.kind === "spend" && editing.t.accountId) usedIds.add(editing.t.accountId);
  if (editing?.kind === "movement") for (const id of movementAccountIds(editing.m)) usedIds.add(id);
  if (editing?.kind === "move") for (const id of [editing.mv.fromAccountId, editing.mv.toAccountId]) if (id) usedIds.add(id);
  const accountOptions = wealth.accounts.filter((a) => !a.archived || usedIds.has(a.id));
  const defaultAccount = lastAccountId && accountsById.get(lastAccountId)?.archived === false ? lastAccountId : "";
  const salaryDefault: BudgetChoice = wealth.profile.salaryMonth === "next" ? "next" : "same";

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing?.kind === "spend") {
      const t = editing.t;
      setKind("spend");
      setAmount(String(t.amount));
      setDate(t.date);
      setNote(t.note ?? "");
      setCategoryId(t.categoryId);
      setAccountId(t.accountId ?? "");
      return;
    }
    if (editing?.kind === "move") {
      const mv = editing.mv;
      setKind("move");
      setAmount(String(mv.amount));
      setDate(mv.date);
      setNote(mv.note ?? "");
      setFromCatId(mv.fromCategoryId);
      setToCatId(mv.toCategoryId);
      setMoveAccounts(!!mv.fromAccountId);
      setFromId(mv.fromAccountId ?? defaultAccount);
      setToId(mv.toAccountId ?? "");
      return;
    }
    if (editing?.kind === "movement") {
      const m = editing.m;
      setKind(m.type);
      setAmount(String(m.amount));
      setDate(m.date);
      setNote(m.note ?? "");
      if (m.type === "income") {
        setAccountId(m.accountId);
        setSource(m.source);
        setBudgetChoice(choiceFor(m));
      } else if (m.type === "expense") {
        setAccountId(m.accountId);
      } else {
        setFromId(m.fromAccountId);
        setToId(m.toAccountId);
      }
      return;
    }
    setRepeat(false);
    setPayFull(false);
    if (prefill) {
      const t = prefill.rule.template;
      setKind(t.kind);
      setAmount(prefill.amount !== null ? String(prefill.amount) : "");
      setDate(prefill.date);
      setNote(t.note ?? "");
      if (t.kind === "spend") {
        setCategoryId(t.categoryId);
        setAccountId(t.accountId ?? "");
      } else if (t.kind === "income") {
        setAccountId(t.accountId);
        setSource(t.source);
        setBudgetChoice(t.budgetOffset === null ? "none" : t.budgetOffset === 1 ? "next" : "same");
      } else if (t.kind === "transfer") {
        setFromId(t.fromAccountId);
        setToId(t.toAccountId);
      } else {
        setAccountId(t.accountId);
      }
      return;
    }
    setKind(initialKind);
    setAmount("");
    setDate(todayIso());
    setNote("");
    setCategoryId(defaultCategoryId ?? activeCategories[0]?.id ?? "");
    setAccountId(defaultAccount);
    setFromId(defaultAccount);
    setToId("");
    setSource("salary");
    setBudgetChoice(salaryDefault);
    setFromCatId("");
    setToCatId("");
    setMoveAccounts(false);
    // Reset only when the sheet opens, not on every store change while it's open.
  }, [open]);

  const dateValid = isValidIsoDate(date);
  const dateMonth = dateValid ? date.slice(0, 7) : month;
  const budgetMonth =
    kind === "income" && budgetChoice !== "none"
      ? budgetChoice === "same"
        ? dateMonth
        : addMonths(dateMonth, 1)
      : undefined;

  // Live balances for the "pay full balance" shortcut.
  const today = todayIso();
  const toAccount = toId ? accountsById.get(toId) : undefined;
  const fromAccount = fromId ? accountsById.get(fromId) : undefined;
  const toOwed = useMemo(() => {
    if (!toAccount || !KIND_META[toAccount.kind].liability) return null;
    const v = accountViews({ ...wealth, accounts: [toAccount] }, today, today, transactions)[0];
    return v?.balance ?? null;
  }, [toAccount, wealth, transactions, today]);

  // Category balances for the move preview, as they stand without the move being edited.
  const editingMoveId = editing?.kind === "move" ? editing.mv.id : null;
  const moveRows = useMemo(() => {
    if (kind !== "move") return null;
    const others = wealth.moves.filter((m) => m.id !== editingMoveId);
    const eff = makeEffectiveBudget(baselineBudget, reallocations, wealth.movements, others);
    const source = { baseline: baselineBudget.budgets, reallocations: allReallocations(reallocations, others) };
    const rows = categoryRows(eff, source, computeMonth(eff, dateMonth), [], dateMonth);
    return new Map(rows.map((r) => [r.categoryId, r]));
  }, [kind, wealth.moves, wealth.movements, editingMoveId, baselineBudget, reallocations, dateMonth]);
  // Only categories the engine counts in that month — otherwise one side of the move would vanish.
  const moveCategories = activeCategories.filter((c) => moveRows?.has(c.id));

  function save() {
    const a = parseMoneyInput(amount);
    if (a === null || a === 0) return setError("Enter an amount.");
    if (!dateValid) return setError("Enter a valid date.");
    const trimmed = note.trim() || undefined;
    let recurringId = prefill?.rule.id;
    let repeatFailed = false;
    // A new repeating rule starts with this entry, so this month's reminder is already done.
    const startRule = (template: RecurringTemplate) => {
      if (editing || prefill || !repeat) return;
      const id = addRecurring({ template, day: Number(date.slice(8, 10)), startMonth: dateMonth });
      if (id) recurringId = id;
      else repeatFailed = true;
    };
    const repeatNote = () => (repeatFailed ? " · couldn't set up repeat" : recurringId && !prefill ? " · repeats monthly" : "");

    if (kind === "spend") {
      if (!categoryId) return setError("Choose a category.");
      const payload = { categoryId, date, amount: a, note: trimmed, accountId: accountId || undefined };
      if (editing?.kind === "spend") {
        editTxn(editing.t.id, payload);
        showToast("Transaction updated");
      } else {
        startRule({ kind: "spend", amount: a, categoryId, ...(accountId ? { accountId } : {}), ...(trimmed ? { note: trimmed } : {}) });
        addTxn({ ...payload, ...(recurringId ? { recurringId } : {}) });
        const cat = categories.find((c) => c.id === categoryId);
        showToast(`${formatGBP(a)} logged${cat ? ` to ${cat.name}` : ""}${repeatNote()}`);
      }
      return onClose();
    }

    if (a < 0) return setError("Enter a positive amount.");
    const withNote = trimmed ? { note: trimmed } : {};

    if (kind === "move") {
      if (!fromCatId || !toCatId) return setError("Choose both categories.");
      if (fromCatId === toCatId) return setError("Pick two different categories.");
      if (!moveRows?.has(fromCatId) || !moveRows.has(toCatId))
        return setError(`Both categories need to exist in ${monthLabel(dateMonth)}.`);
      if (moveAccounts) {
        if (!fromId || !toId) return setError("Choose both accounts, or untick the account option.");
        if (fromId === toId) return setError("Pick two different accounts.");
      }
      const input: MoveInput = {
        date,
        amount: a,
        fromCategoryId: fromCatId,
        toCategoryId: toCatId,
        ...(moveAccounts ? { fromAccountId: fromId, toAccountId: toId } : {}),
        note: trimmed,
      };
      const ok = editing?.kind === "move" ? editMove(editing.mv.id, input) : addMove(input) !== null;
      if (!ok) return setError("Couldn't save — check the amount, categories and accounts.");
      const name = (id: string) => categories.find((c) => c.id === id)?.name ?? "category";
      showToast(editing ? "Move updated" : `${formatGBP(a)} moved from ${name(fromCatId)} to ${name(toCatId)}`);
      return onClose();
    }
    let input: MovementInput;
    if (kind === "income") {
      if (!accountId) return setError("Choose the account it went into.");
      startRule({
        kind: "income",
        amount: a,
        accountId,
        source,
        budgetOffset: budgetChoice === "none" ? null : budgetChoice === "next" ? 1 : 0,
        ...withNote,
      });
      input = { type: "income", date, amount: a, accountId, source, budgetMonth, note: trimmed, recurringId };
    } else if (kind === "expense") {
      if (!accountId) return setError("Choose the account it came from.");
      startRule({ kind: "expense", amount: a, accountId, ...withNote });
      input = { type: "expense", date, amount: a, accountId, note: trimmed, recurringId };
    } else {
      if (!fromId || !toId) return setError("Choose both accounts.");
      if (fromId === toId) return setError("Pick two different accounts.");
      const fullBalance = payFull && !!toAccount && KIND_META[toAccount.kind].liability;
      startRule({ kind: "transfer", amount: a, fromAccountId: fromId, toAccountId: toId, ...(fullBalance ? { payFullBalance: true } : {}), ...withNote });
      input = { type: "transfer", date, amount: a, fromAccountId: fromId, toAccountId: toId, note: trimmed, recurringId };
    }
    // When editing, keep the entry's link to its repeating rule.
    if (editing?.kind === "movement" && editing.m.recurringId) input = { ...input, recurringId: editing.m.recurringId };
    const ok = editing?.kind === "movement" ? editMovement(editing.m.id, input) : addMovement(input) !== null;
    if (!ok) return setError("Couldn't save — check the amount and accounts.");
    showToast(
      editing
        ? "Entry updated"
        : (kind === "income"
            ? `${formatGBP(a)} income logged${budgetMonth ? ` · counts toward ${monthLabel(budgetMonth)}` : ""}`
            : kind === "expense"
              ? `${formatGBP(a)} off-budget spend logged`
              : `${formatGBP(a)} moved to ${accountsById.get(toId)?.name ?? "account"}`) + repeatNote(),
    );
    onClose();
  }

  function remove() {
    if (editing?.kind === "spend") {
      const t = editing.t;
      deleteTxn(t.id);
      showToast(`Deleted ${formatGBP(t.amount)}`, {
        actionLabel: "Undo",
        onAction: () => {
          addTxn({
            categoryId: t.categoryId,
            date: t.date,
            amount: t.amount,
            ...(t.note ? { note: t.note } : {}),
            ...(t.accountId ? { accountId: t.accountId } : {}),
            ...(t.loggedAt !== undefined ? { loggedAt: t.loggedAt } : {}),
            ...(t.recurringId ? { recurringId: t.recurringId } : {}),
          });
        },
      });
    } else if (editing?.kind === "move") {
      const mv = editing.mv;
      deleteMove(mv.id);
      showToast(`Deleted ${formatGBP(mv.amount)} move`, {
        actionLabel: "Undo",
        onAction: () => {
          const { id: _id, ...rest } = mv;
          addMove(rest);
        },
      });
    } else if (editing?.kind === "movement") {
      const m = editing.m;
      deleteMovement(m.id);
      showToast(`Deleted ${formatGBP(m.amount)} ${m.type === "expense" ? "off-budget spend" : m.type}`, {
        actionLabel: "Undo",
        onAction: () => {
          // Restores the original log time so it slots back in the same place against check-ins.
          const { id: _id, ...rest } = m;
          addMovement(rest as MovementInput);
        },
      });
    }
    onClose();
  }

  const accountSelect = (value: string, onChange: (v: string) => void, placeholder: string, allowNone = false) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone ? <option value="">Not linked to an account</option> : <option value="" disabled>{placeholder}</option>}
      {accountOptions.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {KIND_META[a.kind].label}
          {a.archived ? " (archived)" : ""}
        </option>
      ))}
    </Select>
  );

  const noAccounts = accountOptions.length === 0;
  const title = editing
    ? `Edit ${editingKind === "spend" ? "transaction" : editingKind === "expense" ? "off-budget spend" : editingKind}`
    : prefill
      ? "Log repeating entry"
      : "New entry";
  const repeatDay = dateValid ? Number(date.slice(8, 10)) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      onSubmit={save}
      footer={
        <>
          {editing && (
            <button type="button" className="btn-danger mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-accent"
            disabled={
              (kind === "spend" && activeCategories.length === 0) ||
              (kind === "move" && moveCategories.length < 2) ||
              (kind !== "spend" && kind !== "move" && noAccounts)
            }
          >
            {editing ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {prefill && (
          <p className="rounded-2xl bg-accent/10 px-4 py-2.5 text-[12px] font-medium text-ink-soft">
            Repeats monthly on the {ordinal(prefill.rule.day)}. Check the amount, then add.
          </p>
        )}
        {!editing && !prefill && (
          <div className="seg grid-cols-[repeat(5,auto)]" role="radiogroup" aria-label="Entry type">
            {(["spend", "income", "transfer", "expense", "move"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setError(null);
                }}
                className="seg-btn !text-[12px] !px-1.5 whitespace-nowrap"
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {kind === "move" && moveCategories.length < 2 ? (
          <div className="rounded-2xl bg-surface-sunken/60 px-4 py-4 text-[13px] text-ink-soft leading-snug">
            You need at least two active categories in {monthLabel(dateMonth)} to move budget between them.
          </div>
        ) : kind !== "spend" && kind !== "move" && noAccounts ? (
          <div className="rounded-2xl bg-surface-sunken/60 px-4 py-4 text-[13px] text-ink-soft leading-snug">
            Income and transfers move money between your accounts. Add your accounts in{" "}
            <span className="font-semibold text-ink">Wealth</span> first.
          </div>
        ) : kind === "spend" && activeCategories.length === 0 ? (
          <div className="rounded-2xl bg-surface-sunken/60 px-4 py-4 text-[13px] text-ink-soft leading-snug">
            Create a budget category first to start logging spend.
          </div>
        ) : (
          <>
            <Field label="Amount">
              <MoneyInput value={amount} onChange={setAmount} autoFocus />
            </Field>

            {kind === "spend" && (
              <>
                <Field label="Category">
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {activeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!noAccounts && (
                  <Field
                    label="Paid with"
                    hint={
                      accountId
                        ? KIND_META[accountsById.get(accountId)!.kind].liability
                          ? "Adds to what you owe on this card until you log the repayment."
                          : "Comes off this account's balance."
                        : "Budget only — no account balance changes."
                    }
                  >
                    {accountSelect(accountId, setAccountId, "", true)}
                  </Field>
                )}
              </>
            )}

            {kind === "income" && (
              <>
                <div className="seg grid-cols-2" role="radiogroup" aria-label="Income type">
                  {(["salary", "other"] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      role="radio"
                      aria-checked={source === src}
                      onClick={() => {
                        setSource(src);
                        // Salary funds a budget month by default; one-offs don't unless asked.
                        if (!editing) setBudgetChoice(src === "salary" ? salaryDefault : "none");
                      }}
                      className="seg-btn"
                    >
                      {src === "salary" ? "Salary" : "Other income"}
                    </button>
                  ))}
                </div>
                <Field label="Paid into">{accountSelect(accountId, setAccountId, "Choose account…")}</Field>
                <Field
                  label="Budget income"
                  hint={
                    budgetMonth
                      ? `Adds to ${monthLabel(budgetMonth)}'s income. Once a month has logged income, that becomes its income figure.`
                      : "Goes to the account only — budget income isn't changed."
                  }
                >
                  <div className="seg grid-cols-3" role="radiogroup" aria-label="Counts toward">
                    {(
                      [
                        ["same", monthLabel(dateMonth).split(" ")[0]],
                        ["next", monthLabel(addMonths(dateMonth, 1)).split(" ")[0]],
                        ["none", "Don't add"],
                      ] as const
                    ).map(([c, label]) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={budgetChoice === c}
                        onClick={() => setBudgetChoice(c)}
                        className="seg-btn !text-[12px]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}

            {kind === "move" && moveRows && (
              <MoveFields
                categories={moveCategories}
                rows={moveRows}
                amount={parseMoneyInput(amount)}
                monthName={monthLabel(dateMonth)}
                fromCatId={fromCatId}
                toCatId={toCatId}
                onFromCat={setFromCatId}
                onToCat={setToCatId}
              />
            )}
            {kind === "move" && !noAccounts && (
              <div className="rounded-2xl bg-surface-sunken/60 px-4 py-3 flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[rgb(var(--c-accent))]"
                    checked={moveAccounts}
                    onChange={(e) => setMoveAccounts(e.target.checked)}
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">The money moved between accounts too</span>
                    <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">
                      Updates both balances in Wealth. Leave unticked if only the budget changed.
                    </span>
                  </span>
                </label>
                {moveAccounts && (
                  <>
                    <Field label="From account">{accountSelect(fromId, setFromId, "Choose account…")}</Field>
                    <Field label="To account" hint="Moving your own money. Net worth doesn't change.">
                      {accountSelect(toId, setToId, "Choose account…")}
                    </Field>
                  </>
                )}
              </div>
            )}

            {kind === "expense" && (
              <Field
                label="Paid from"
                hint="Comes off this account and counts in cash flow, but doesn't touch your budget or left to spend. Use it for one-offs like a holiday paid from savings."
              >
                {accountSelect(accountId, setAccountId, "Choose account…")}
              </Field>
            )}

            {kind === "transfer" && (
              <>
                <Field label="From">{accountSelect(fromId, setFromId, "Choose account…")}</Field>
                <Field
                  label="To"
                  hint={
                    toAccount && KIND_META[toAccount.kind].liability
                      ? `Repays ${toAccount.name}. Not spending — the purchases were already counted when you logged them.`
                      : fromAccount && KIND_META[fromAccount.kind].liability
                        ? `Borrowing from ${fromAccount.name} — increases what you owe.`
                        : "Moving your own money. Net worth doesn't change."
                  }
                >
                  {accountSelect(toId, setToId, "Choose account…")}
                </Field>
                {toOwed !== null && toOwed > 0 && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm self-start stat-num"
                    onClick={() => setAmount(String(toOwed))}
                  >
                    Pay full balance · {formatGBP(toOwed)}
                  </button>
                )}
              </>
            )}

            <Field
              label="Date"
              hint={
                dateValid && !date.startsWith(month) && (kind === "spend" || kind === "move")
                  ? `Outside ${monthLabel(month)} — this will appear under ${monthLabel(date.slice(0, 7))}.`
                  : kind === "move"
                    ? "The move counts toward this date's month."
                    : undefined
              }
            >
              <input type="date" name="date" className="input-base" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note (optional)">
              <input
                className="input-base"
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  kind === "spend"
                    ? "e.g. Weekly shop"
                    : kind === "income"
                      ? "e.g. October salary"
                      : kind === "expense"
                        ? "e.g. Holiday flights"
                        : kind === "move"
                          ? "e.g. Birthday savings"
                          : "e.g. Card repayment"
                }
              />
            </Field>
            {!editing && !prefill && repeatDay !== null && kind !== "move" && (
              <div className="rounded-2xl bg-surface-sunken/60 px-4 py-3 flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[rgb(var(--c-accent))]"
                    checked={repeat}
                    onChange={(e) => setRepeat(e.target.checked)}
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">
                      Repeat every month on the {ordinal(repeatDay)}
                    </span>
                    <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">
                      {repeatDay > 28
                        ? "Shorter months use their last day. "
                        : ""}
                      You'll get a reminder in Activity to confirm each one — nothing is logged automatically.
                    </span>
                  </span>
                </label>
                {repeat && kind === "transfer" && toAccount && KIND_META[toAccount.kind].liability && (
                  <label className="flex items-start gap-3 cursor-pointer pl-7">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[rgb(var(--c-accent))]"
                      checked={payFull}
                      onChange={(e) => setPayFull(e.target.checked)}
                    />
                    <span>
                      <span className="block text-[13px] font-semibold text-ink">Always pay the full balance</span>
                      <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">
                        Each reminder uses what {toAccount.name} owes on the day, instead of a fixed amount.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}
            {error && <p className="text-[12px] font-medium text-status-over">{error}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

type Row = ReturnType<typeof categoryRows>[number];

/** Category pickers plus a before → after preview of both balances. */
function MoveFields({
  categories,
  rows,
  amount,
  monthName,
  fromCatId,
  toCatId,
  onFromCat,
  onToCat,
}: {
  categories: Category[];
  rows: Map<string, Row>;
  amount: number | null;
  monthName: string;
  fromCatId: string;
  toCatId: string;
  onFromCat: (id: string) => void;
  onToCat: (id: string) => void;
}) {
  const a = amount !== null && amount > 0 ? amount : 0;
  const from = rows.get(fromCatId);
  const to = rows.get(toCatId);
  const options = (exclude: string) =>
    categories
      .filter((c) => c.id !== exclude)
      .map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} · {formatGBP(rows.get(c.id)?.available ?? 0)}
        </option>
      ));
  const fromAfter = from ? roundMoney(from.available - a) : null;
  return (
    <>
      <Field label="From category">
        <Select value={fromCatId} onChange={(e) => onFromCat(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {options(toCatId)}
        </Select>
      </Field>
      <Field label="To category">
        <Select value={toCatId} onChange={(e) => onToCat(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {options(fromCatId)}
        </Select>
      </Field>
      {(from || to) && (
        <dl className="rounded-2xl border border-surface-border px-4 py-3 flex flex-col gap-1.5 text-[12px]">
          {[from, to].map((r, i) =>
            r ? (
              <div key={r.categoryId} className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 truncate text-ink-soft font-medium">{r.name}</dt>
                <dd className="stat-num whitespace-nowrap text-ink-muted">
                  {formatGBP(r.available)} →{" "}
                  <span
                    className={`font-semibold ${
                      i === 0 && fromAfter !== null && fromAfter < 0 ? "text-status-over" : "text-ink"
                    }`}
                  >
                    {i === 0 ? formatSigned(fromAfter!) : formatGBP(roundMoney(r.available + a))}
                  </span>
                </dd>
              </div>
            ) : null,
          )}
          <p className="text-[11px] text-ink-muted leading-snug">
            {fromAfter !== null && fromAfter < 0
              ? `This takes ${from!.name} over budget for ${monthName}.`
              : `Available in ${monthName}. Not spending — your totals and left to spend don't change.`}
          </p>
        </dl>
      )}
    </>
  );
}

function formatSigned(v: number): string {
  return v < 0 ? `−${formatGBP(-v)}` : formatGBP(v);
}
