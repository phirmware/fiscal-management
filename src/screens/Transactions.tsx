import { useEffect, useMemo, useState } from "react";
import { monthFromDate } from "../engine.js";
import { useAppStore } from "../app/store.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { monthLabel } from "../app/utils/month.js";
import { Modal } from "../components/Modal.js";
import type { Transaction } from "../types.js";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function TransactionsScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const lastCategoryId = useAppStore((s) => s.ui.lastUsedCategoryId);
  const addTxn = useAppStore((s) => s.addTransaction);
  const editTxn = useAppStore((s) => s.editTransaction);
  const deleteTxn = useAppStore((s) => s.deleteTransaction);

  const [filterCat, setFilterCat] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const categoriesById = useMemo(
    () => new Map(budget.categories.map((c) => [c.id, c])),
    [budget.categories],
  );

  const list = useMemo(() => {
    const out = budget.transactions
      .filter((t) => monthFromDate(t.date) === month)
      .filter((t) => filterCat === "all" || t.categoryId === filterCat)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  }, [budget.transactions, month, filterCat]);

  const monthTotal = list.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="flex flex-col gap-3">
      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-soft">Activity</h2>
            <div className="text-xs text-ink-muted">
              {list.length} entries · {formatGBP(monthTotal)} total · {monthLabel(month)}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary text-sm px-3 py-2"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            disabled={budget.categories.length === 0}
          >
            + Add
          </button>
        </div>

        {budget.categories.length > 0 && (
          <select
            className="input-base mt-3"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="all">All categories</option>
            {budget.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {budget.categories.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-ink-soft">Create a category first to start logging spend.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-ink-soft">Nothing logged this month yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((t) => {
            const cat = categoriesById.get(t.categoryId);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className="card w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-surface-sunken/40"
                  onClick={() => {
                    setEditing(t);
                    setOpen(true);
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {cat?.name ?? "Unknown"}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {t.date}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{formatGBP(t.amount)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <TxnModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        defaultCategoryId={lastCategoryId ?? budget.categories[0]?.id ?? null}
        categories={budget.categories}
        onSave={(payload) => {
          if (editing) {
            editTxn(editing.id, payload);
          } else {
            addTxn(payload);
          }
          setOpen(false);
        }}
        onDelete={
          editing
            ? () => {
                deleteTxn(editing.id);
                setOpen(false);
              }
            : undefined
        }
      />
    </div>
  );
}

function TxnModal({
  open,
  onClose,
  editing,
  defaultCategoryId,
  categories,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  editing: Transaction | null;
  defaultCategoryId: string | null;
  categories: { id: string; name: string }[];
  onSave: (payload: { categoryId: string; date: string; amount: number; note?: string }) => void;
  onDelete?: () => void;
}) {
  const [categoryId, setCategoryId] = useState<string>(
    editing?.categoryId ?? defaultCategoryId ?? "",
  );
  const [date, setDate] = useState<string>(editing?.date ?? todayIso());
  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : "");
  const [note, setNote] = useState<string>(editing?.note ?? "");

  // Reset when modal opens
  useReset(open, () => {
    setCategoryId(editing?.categoryId ?? defaultCategoryId ?? "");
    setDate(editing?.date ?? todayIso());
    setAmount(editing ? String(editing.amount) : "");
    setNote(editing?.note ?? "");
  });

  function submit() {
    const a = parseMoneyInput(amount);
    if (!categoryId || a === null) return;
    onSave({ categoryId, date, amount: a, note: note.trim() || undefined });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : "New transaction"}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn-danger mr-auto" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={!categoryId || parseMoneyInput(amount) === null}
          >
            {editing ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          <span className="block text-ink-soft mb-1">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            className="input-base text-lg font-semibold"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-soft mb-1">Category</span>
          <select
            className="input-base"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-ink-soft mb-1">Date</span>
          <input
            type="date"
            className="input-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-soft mb-1">Note (optional)</span>
          <input
            className="input-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder=""
          />
        </label>
      </div>
    </Modal>
  );
}

function useReset(open: boolean, fn: () => void) {
  useEffect(() => {
    if (open) fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
