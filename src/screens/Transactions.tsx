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

  // Group transactions by date for the list
  const groupedByDate = useMemo(() => {
    const groups: { date: string; label: string; items: typeof list }[] = [];
    const map = new Map<string, typeof list>();
    for (const t of list) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    for (const [date, items] of map) {
      const d = new Date(date);
      const label = isNaN(d.getTime())
        ? date
        : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      groups.push({ date, label, items });
    }
    return groups;
  }, [list]);

  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero p-6">
        <div className="section-row">
          <span className="section-eyebrow">Spent in {monthLabel(month)}</span>
          <button
            type="button"
            className="btn-accent btn-sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            disabled={budget.categories.length === 0}
          >
            + Add
          </button>
        </div>
        <div className="mt-2">
          <h2 className="text-display-xl text-balance-gradient stat-num">
            {formatGBP(monthTotal)}
          </h2>
        </div>
        <div className="text-[12px] text-ink-muted mt-1">
          {list.length} {list.length === 1 ? "entry" : "entries"}
        </div>

        {budget.categories.length > 0 && (
          <select
            className="input-base mt-5"
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
        <div className="card p-10 text-center">
          <p className="text-[14px] text-ink-soft">Create a category first to start logging spend.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[14px] text-ink-soft">Nothing logged this month yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groupedByDate.map((group) => {
            const dayTotal = group.items.reduce((s, t) => s + t.amount, 0);
            return (
              <section key={group.date}>
                <div className="section-row mb-2 px-1">
                  <span className="text-[12px] font-semibold text-ink-soft tracking-tight">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-ink-muted stat-num">
                    {formatGBP(dayTotal)}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {group.items.map((t) => {
                    const cat = categoriesById.get(t.categoryId);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="card-interactive w-full text-left p-4 flex items-center
                            justify-between gap-3"
                          onClick={() => {
                            setEditing(t);
                            setOpen(true);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold tracking-tight text-ink truncate">
                              {cat?.name ?? "Unknown"}
                            </div>
                            {t.note && (
                              <div className="text-[12px] text-ink-muted mt-0.5 truncate">
                                {t.note}
                              </div>
                            )}
                          </div>
                          <div className="text-[15px] font-semibold stat-num text-ink whitespace-nowrap">
                            {formatGBP(t.amount)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
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
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Amount</span>
          <div className="relative">
            <span
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted
                text-lg font-semibold pointer-events-none"
              aria-hidden="true"
            >
              £
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="input-base !pl-7 text-xl font-semibold stat-num"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Category</span>
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
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Date</span>
          <input
            type="date"
            className="input-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">
            Note <span className="text-ink-muted font-normal">(optional)</span>
          </span>
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
