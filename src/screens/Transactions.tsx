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

function friendlyDayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetMid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayMid - targetMid) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("en-GB", { weekday: "long" });
  }
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
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
      groups.push({ date, label: friendlyDayLabel(date), items });
    }
    return groups;
  }, [list]);

  // Counts per category for the filter chips
  const countsByCat = useMemo(() => {
    const counts = new Map<string, number>();
    const monthList = budget.transactions.filter((t) => monthFromDate(t.date) === month);
    for (const t of monthList) {
      counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [budget.transactions, month]);

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
          {filterCat !== "all" && (
            <>
              {" "}· filtered to{" "}
              <span className="text-ink-soft font-medium">
                {categoriesById.get(filterCat)?.name ?? "unknown"}
              </span>
            </>
          )}
        </div>
      </section>

      {budget.categories.length > 0 && (
        <div
          className="-mx-4 px-4 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Filter by category"
        >
          <div className="flex gap-2 pb-1 min-w-min">
            <FilterChip
              label="All"
              count={list.length}
              active={filterCat === "all"}
              onClick={() => setFilterCat("all")}
            />
            {budget.categories.map((c) => {
              const count = countsByCat.get(c.id) ?? 0;
              if (count === 0 && filterCat !== c.id) return null;
              return (
                <FilterChip
                  key={c.id}
                  label={c.name}
                  count={count}
                  active={filterCat === c.id}
                  group={c.group}
                  onClick={() => setFilterCat(c.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {budget.categories.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[14px] text-ink-soft">Create a category first to start logging spend.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center">
          <div
            className="w-12 h-12 rounded-full bg-accent/10 text-accent
              flex items-center justify-center mx-auto mb-3 text-xl"
            aria-hidden="true"
          >
            ✦
          </div>
          <p className="text-[14px] font-semibold text-ink">Nothing logged yet</p>
          <p className="text-[12px] text-ink-muted mt-1">
            Tap <span className="font-semibold text-ink-soft">+ Add</span> to log your first spend.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupedByDate.map((group) => {
            const dayTotal = group.items.reduce((s, t) => s + t.amount, 0);
            return (
              <section key={group.date}>
                <div
                  className="sticky top-0 z-[1] -mx-4 px-4 py-2
                    bg-surface/85 backdrop-blur-md
                    flex items-baseline justify-between gap-3
                    after:content-[''] after:absolute after:inset-x-4 after:bottom-0
                    after:h-px after:bg-surface-border/50"
                >
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-ink-muted stat-num font-medium">
                    {formatGBP(dayTotal)}
                  </span>
                </div>
                <ul className="card overflow-hidden divide-y divide-surface-border">
                  {group.items.map((t) => {
                    const cat = categoriesById.get(t.categoryId);
                    const groupName = cat?.group ?? "Wants";
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-3.5 flex items-center gap-3
                            transition hover:bg-surface-sunken/60 active:bg-surface-sunken/80
                            focus-ring"
                          onClick={() => {
                            setEditing(t);
                            setOpen(true);
                          }}
                        >
                          <CategoryAvatar
                            name={cat?.name ?? "?"}
                            group={groupName}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold tracking-tight text-ink truncate">
                              {t.note?.trim() ? t.note : (cat?.name ?? "Unknown")}
                            </div>
                            <div className="text-[11px] text-ink-muted truncate mt-0.5">
                              {t.note?.trim() ? cat?.name ?? "Unknown" : groupName}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[15px] font-semibold stat-num text-ink whitespace-nowrap">
                              −{formatGBP(t.amount)}
                            </div>
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

const GROUP_VAR: Record<string, string> = {
  Needs: "--c-group-needs",
  Wants: "--c-group-wants",
  Savings: "--c-group-savings",
};

function FilterChip({
  label,
  count,
  active,
  group,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  group?: string;
  onClick: () => void;
}) {
  const varName = group ? GROUP_VAR[group] ?? "--c-accent" : "--c-accent";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold
        tracking-tight transition active:scale-[0.96] focus-ring border
        flex items-center gap-1.5
        ${
          active
            ? "text-ink"
            : "bg-surface-card text-ink-soft border-surface-border hover:text-ink"
        }`}
      style={
        active
          ? {
              background: `rgb(var(${varName}) / 0.14)`,
              borderColor: `rgb(var(${varName}) / 0.35)`,
              color: `rgb(var(${varName}))`,
            }
          : undefined
      }
    >
      <span>{label}</span>
      <span
        className={`stat-num text-[11px] font-bold ${
          active ? "" : "text-ink-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function categoryInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return cleaned.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function CategoryAvatar({ name, group }: { name: string; group: string }) {
  const varName = GROUP_VAR[group] ?? "--c-ink-faint";
  return (
    <div
      className="relative w-10 h-10 rounded-full flex items-center justify-center
        flex-shrink-0 text-[12px] font-bold tracking-tight"
      style={{
        background: `rgb(var(${varName}) / 0.14)`,
        color: `rgb(var(${varName}))`,
        boxShadow: `inset 0 0 0 1px rgb(var(${varName}) / 0.18)`,
      }}
      aria-hidden="true"
    >
      {categoryInitials(name)}
    </div>
  );
}
