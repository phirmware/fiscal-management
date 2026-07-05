import { useEffect, useMemo, useState } from "react";
import { monthFromDate } from "../engine.js";
import { useAppStore } from "../app/store.js";
import { formatGBP, parseMoneyInput, roundMoney } from "../app/utils/money.js";
import { friendlyDayLabel, isValidIsoDate, monthLabel, todayIso } from "../app/utils/month.js";
import { AnimatedGBP } from "../components/AnimatedNumber.js";
import { Modal } from "../components/Modal.js";
import { Select } from "../components/Select.js";
import { showToast } from "../components/Toast.js";
import type { Transaction } from "../types.js";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function TransactionsScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const lastCategoryId = useAppStore((s) => s.ui.lastUsedCategoryId);
  const addTxn = useAppStore((s) => s.addTransaction);
  const editTxn = useAppStore((s) => s.editTransaction);
  const deleteTxn = useAppStore((s) => s.deleteTransaction);

  const [filterCat, setFilterCat] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const categoriesById = useMemo(
    () => new Map(budget.categories.map((c) => [c.id, c])),
    [budget.categories],
  );

  const monthList = useMemo(
    () => budget.transactions.filter((t) => monthFromDate(t.date) === month),
    [budget.transactions, month],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthList
      .filter((t) => filterCat === "all" || t.categoryId === filterCat)
      .filter((t) => {
        if (!q) return true;
        const cat = categoriesById.get(t.categoryId);
        return (
          (t.note ?? "").toLowerCase().includes(q) ||
          (cat?.name ?? "").toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  }, [monthList, filterCat, query, categoriesById]);

  const monthTotal = roundMoney(list.reduce((s, t) => s + t.amount, 0));

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
    for (const t of monthList) {
      counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [monthList]);

  const showSearch = monthList.length > 6 || query !== "";

  function handleDelete(t: Transaction) {
    deleteTxn(t.id);
    setOpen(false);
    const cat = categoriesById.get(t.categoryId);
    showToast(`Deleted ${formatGBP(t.amount)}${cat ? ` from ${cat.name}` : ""}`, {
      actionLabel: "Undo",
      onAction: () => {
        addTxn({
          categoryId: t.categoryId,
          date: t.date,
          amount: t.amount,
          ...(t.note ? { note: t.note } : {}),
        });
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        className="card-hero holo-panel p-6 rise"
        style={{ "--rise-i": 0 } as React.CSSProperties}
      >
        <div className="section-row">
          <span className="section-eyebrow">Spent in {monthLabel(month)}</span>
          <button
            type="button"
            className="btn-secondary btn-sm"
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
            <AnimatedGBP value={monthTotal} />
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
          {query.trim() !== "" && (
            <>
              {" "}· matching{" "}
              <span className="text-ink-soft font-medium">“{query.trim()}”</span>
            </>
          )}
        </div>
      </section>

      {showSearch && (
        <div className="relative rise" style={{ "--rise-i": 1 } as React.CSSProperties}>
          <SearchIcon
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted
              pointer-events-none"
          />
          <input
            type="search"
            name="txn-search"
            className="input-base !pl-10 !py-2.5"
            placeholder="Search notes and categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search transactions"
          />
          {query !== "" && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-semibold
                text-ink-muted hover:text-ink px-2 py-1 rounded-lg focus-ring"
              onClick={() => setQuery("")}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {budget.categories.length > 0 && (
        <div
          className="-mx-4 px-4 overflow-x-auto no-scrollbar rise"
          style={{ "--rise-i": 2 } as React.CSSProperties}
          role="tablist"
          aria-label="Filter by category"
        >
          <div className="flex gap-2 pb-1 min-w-min">
            <FilterChip
              label="All"
              count={monthList.length}
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
                  onClick={() => setFilterCat(filterCat === c.id ? "all" : c.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {budget.categories.length === 0 ? (
        <div className="card p-10 text-center rise" style={{ "--rise-i": 2 } as React.CSSProperties}>
          <p className="text-[14px] text-ink-soft">Create a category first to start logging spend.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="card p-10 text-center rise" style={{ "--rise-i": 3 } as React.CSSProperties}>
          <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-3 text-accent" aria-hidden="true">
            <path
              d="M12 3v18M5.5 8.5c0-1.93 2.91-3.5 6.5-3.5s6.5 1.57 6.5 3.5S15.59 12 12 12s-6.5 1.57-6.5 3.5S8.41 19 12 19s6.5-1.57 6.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </svg>
          {query.trim() !== "" || filterCat !== "all" ? (
            <>
              <p className="text-[15px] font-semibold text-ink">No matches</p>
              <p className="text-[13px] text-ink-muted mt-1">
                Try clearing the search or the category filter.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-ink">Nothing logged yet</p>
              <p className="text-[13px] text-ink-muted mt-1">
                Tap <span className="font-semibold text-ink-soft">+ Add</span> to log your first spend.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupedByDate.map((group, gi) => {
            const dayTotal = roundMoney(group.items.reduce((s, t) => s + t.amount, 0));
            return (
              <section
                key={group.date}
                className="rise"
                style={{ "--rise-i": Math.min(gi + 3, 8) } as React.CSSProperties}
              >
                <div
                  className="sticky top-0 z-[1] -mx-4 px-4 py-2
                    bg-surface/85 backdrop-blur-md
                    flex items-baseline justify-between gap-3
                    after:content-[''] after:absolute after:inset-x-4 after:bottom-0
                    after:h-px after:bg-surface-border/50"
                >
                  <span className="text-[12px] font-semibold text-ink-soft">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-ink-muted stat-num font-medium">
                    {formatGBP(dayTotal)}
                  </span>
                </div>
                <ul role="list" className="ledger-panel">
                  {group.items.map((t) => {
                    const cat = categoriesById.get(t.categoryId);
                    const groupName = cat?.group ?? "Wants";
                    return (
                      <li
                        key={t.id}
                        className="relative z-[1] border-b border-surface-border/60 last:border-b-0"
                      >
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
        month={month}
        defaultCategoryId={lastCategoryId ?? budget.categories[0]?.id ?? null}
        categories={budget.categories}
        onSave={(payload) => {
          if (editing) {
            editTxn(editing.id, payload);
            showToast("Transaction updated");
          } else {
            addTxn(payload);
            const cat = categoriesById.get(payload.categoryId);
            showToast(`${formatGBP(payload.amount)} logged${cat ? ` to ${cat.name}` : ""}`);
          }
          setOpen(false);
        }}
        onDelete={editing ? () => handleDelete(editing) : undefined}
      />
    </div>
  );
}

function TxnModal({
  open,
  onClose,
  editing,
  month,
  defaultCategoryId,
  categories,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  editing: Transaction | null;
  month: string;
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

  const dateValid = isValidIsoDate(date);
  const canSave = !!categoryId && parseMoneyInput(amount) !== null && dateValid;
  const differentMonth = dateValid && !date.startsWith(month);

  function submit() {
    const a = parseMoneyInput(amount);
    if (!categoryId || a === null || !dateValid) return;
    onSave({ categoryId, date, amount: a, note: note.trim() || undefined });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : "New transaction"}
      onSubmit={submit}
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
          <button type="submit" className="btn-accent" disabled={!canSave}>
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
              name="amount"
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
          <Select
            name="category"
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
          </Select>
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">Date</span>
          <input
            type="date"
            name="date"
            className="input-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {!dateValid && date !== "" && (
            <p className="text-[12px] text-status-over mt-1.5">Enter a valid date.</p>
          )}
          {differentMonth && (
            <p className="text-[12px] text-status-info mt-1.5 leading-snug">
              This date is outside {monthLabel(month)} — the entry will appear under{" "}
              {monthLabel(date.slice(0, 7))}.
            </p>
          )}
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-ink-soft mb-1.5">
            Note <span className="text-ink-muted font-normal">(optional)</span>
          </span>
          <input
            className="input-base"
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Weekly shop"
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
        className={`stat-num text-[11px] font-semibold ${
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
        shrink-0 text-[12px] font-semibold tracking-tight"
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
