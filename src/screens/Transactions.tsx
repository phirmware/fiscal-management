import { useMemo, useState } from "react";
import { monthFromDate } from "../engine.js";
import type { BudgetMove, ExpenseMovement, IncomeMovement, RecurringRule, TransferMovement } from "../app/state.js";
import { entryFor, occurrencesFor, ordinal } from "../app/recurring.js";
import type { Occurrence } from "../app/recurring.js";
import { useAppStore } from "../app/store.js";
import { formatGBP, roundMoney } from "../app/utils/money.js";
import { friendlyDayLabel, monthLabel, todayIso } from "../app/utils/month.js";
import { AnimatedGBP } from "../components/AnimatedNumber.js";
import { EntryModal } from "../components/EntryModal.js";
import type { EditTarget, Prefill } from "../components/EntryModal.js";
import { Modal } from "../components/Modal.js";
import { showToast } from "../components/Toast.js";
import type { Category, Transaction } from "../types.js";

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

type TypeFilter = "all" | "spend" | "income" | "transfer" | "expense" | "move";

type Entry =
  | { kind: "spend"; id: string; date: string; loggedAt: number; t: Transaction }
  | { kind: "income"; id: string; date: string; loggedAt: number; m: IncomeMovement }
  | { kind: "transfer"; id: string; date: string; loggedAt: number; m: TransferMovement }
  | { kind: "expense"; id: string; date: string; loggedAt: number; m: ExpenseMovement }
  | { kind: "move"; id: string; date: string; loggedAt: number; mv: BudgetMove };

export function TransactionsScreen() {
  const budget = useAppStore((s) => s.budget);
  const wealth = useAppStore((s) => s.wealth);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const lastCategoryId = useAppStore((s) => s.ui.lastUsedCategoryId);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const addTxn = useAppStore((s) => s.addTransaction);
  const addMovement = useAppStore((s) => s.addMovement);
  const skipOccurrence = useAppStore((s) => s.skipOccurrence);

  const categoriesById = useMemo(
    () => new Map(budget.categories.map((c) => [c.id, c])),
    [budget.categories],
  );
  const accountsById = useMemo(
    () => new Map(wealth.accounts.map((a) => [a.id, a])),
    [wealth.accounts],
  );
  const accountName = (id: string | undefined) => (id ? accountsById.get(id)?.name ?? "Deleted account" : "");

  const monthEntries = useMemo(() => {
    const out: Entry[] = [];
    for (const t of budget.transactions) {
      if (monthFromDate(t.date) === month) out.push({ kind: "spend", id: t.id, date: t.date, loggedAt: t.loggedAt ?? 0, t });
    }
    for (const m of wealth.movements) {
      if (m.date.slice(0, 7) !== month) continue;
      if (m.type === "income") out.push({ kind: "income", id: m.id, date: m.date, loggedAt: m.loggedAt, m });
      else if (m.type === "expense") out.push({ kind: "expense", id: m.id, date: m.date, loggedAt: m.loggedAt, m });
      else out.push({ kind: "transfer", id: m.id, date: m.date, loggedAt: m.loggedAt, m });
    }
    for (const mv of wealth.moves) {
      if (mv.date.slice(0, 7) === month) out.push({ kind: "move", id: mv.id, date: mv.date, loggedAt: mv.loggedAt, mv });
    }
    return out;
  }, [budget.transactions, wealth.movements, wealth.moves, month]);

  const monthSpends = useMemo(
    () => monthEntries.filter((e): e is Extract<Entry, { kind: "spend" }> => e.kind === "spend"),
    [monthEntries],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthEntries
      .filter((e) => {
        if (filterCat !== "all")
          return e.kind === "spend"
            ? e.t.categoryId === filterCat
            : e.kind === "move" && (e.mv.fromCategoryId === filterCat || e.mv.toCategoryId === filterCat);
        return typeFilter === "all" || e.kind === typeFilter;
      })
      .filter((e) => {
        if (!q) return true;
        const hay =
          e.kind === "spend"
            ? [e.t.note, categoriesById.get(e.t.categoryId)?.name, accountName(e.t.accountId)]
            : e.kind === "income"
              ? [e.m.note, e.m.source === "salary" ? "salary" : "income", accountName(e.m.accountId)]
              : e.kind === "expense"
                ? [e.m.note, "off-budget", accountName(e.m.accountId)]
                : e.kind === "move"
                  ? [
                      e.mv.note,
                      "move",
                      categoriesById.get(e.mv.fromCategoryId)?.name,
                      categoriesById.get(e.mv.toCategoryId)?.name,
                      accountName(e.mv.fromAccountId),
                      accountName(e.mv.toAccountId),
                    ]
                  : [e.m.note, "transfer", accountName(e.m.fromAccountId), accountName(e.m.toAccountId)];
        return hay.some((h) => (h ?? "").toLowerCase().includes(q));
      })
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.loggedAt - a.loggedAt || (a.id < b.id ? 1 : -1)));
  }, [monthEntries, filterCat, typeFilter, query, categoriesById, accountsById]);

  const spentTotal = roundMoney(list.reduce((s, e) => s + (e.kind === "spend" ? e.t.amount : 0), 0));
  const incomeTotal = roundMoney(monthEntries.reduce((s, e) => s + (e.kind === "income" ? e.m.amount : 0), 0));
  const offBudgetTotal = roundMoney(monthEntries.reduce((s, e) => s + (e.kind === "expense" ? e.m.amount : 0), 0));
  const counts = {
    all: monthEntries.length,
    spend: monthSpends.length,
    income: monthEntries.filter((e) => e.kind === "income").length,
    transfer: monthEntries.filter((e) => e.kind === "transfer").length,
    expense: monthEntries.filter((e) => e.kind === "expense").length,
    move: monthEntries.filter((e) => e.kind === "move").length,
  };

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of list) {
      const g = map.get(e.date);
      if (g) g.push(e);
      else map.set(e.date, [e]);
    }
    return Array.from(map, ([date, items]) => ({ date, label: friendlyDayLabel(date), items }));
  }, [list]);

  const countsByCat = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of monthSpends) counts.set(e.t.categoryId, (counts.get(e.t.categoryId) ?? 0) + 1);
    return counts;
  }, [monthSpends]);

  const showSearch = monthEntries.length > 6 || query !== "";
  const canAdd = budget.categories.length > 0 || wealth.accounts.length > 0;
  const hasAccounts = wealth.accounts.length > 0;

  function openEntry(target: EditTarget) {
    setPrefill(null);
    setEditing(target);
    setOpen(true);
  }

  const today = todayIso();
  const occurrences = useMemo(
    () => occurrencesFor(wealth, budget.transactions, month, today),
    [wealth, budget.transactions, month, today],
  );

  function describeRule(rule: RecurringRule): { title: string; subtitle: string } {
    const t = rule.template;
    const when = `Monthly on the ${ordinal(rule.day)}`;
    if (t.kind === "spend") {
      const cat = categoriesById.get(t.categoryId)?.name ?? "Deleted category";
      return { title: t.note || cat, subtitle: `${when} · ${t.note ? `${cat} · ` : ""}${t.accountId ? accountName(t.accountId) : "budget only"}` };
    }
    if (t.kind === "income") {
      return { title: t.note || (t.source === "salary" ? "Salary" : "Income"), subtitle: `${when} · into ${accountName(t.accountId)}` };
    }
    if (t.kind === "expense") {
      return { title: t.note || "Off-budget spend", subtitle: `${when} · from ${accountName(t.accountId)}` };
    }
    return {
      title: t.note || (t.payFullBalance ? `Pay off ${accountName(t.toAccountId)}` : "Transfer"),
      subtitle: `${when} · ${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}${t.payFullBalance ? " · full balance" : ""}`,
    };
  }

  function logNow(o: Occurrence) {
    if (o.amount === null) return;
    const e = entryFor(o.rule, o.date, o.amount);
    if (e.kind === "spend") addTxn(e.input);
    else if (!addMovement(e.input)) {
      showToast("Couldn't log — check the rule's accounts still exist");
      return;
    }
    showToast(`${describeRule(o.rule).title} logged · ${formatGBP(o.amount)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        className="card-hero holo-panel p-6 rise"
        style={{ "--rise-i": 0 } as React.CSSProperties}
      >
        <div className="section-row">
          <span className="section-eyebrow">Spent in {monthLabel(month)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => openEntry(null)} disabled={!canAdd}>
            + Add
          </button>
        </div>
        <div className="mt-2">
          <h2 className="text-display-xl text-balance-gradient stat-num">
            <AnimatedGBP value={spentTotal} />
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
        {hasAccounts && (incomeTotal > 0 || offBudgetTotal > 0) && (
          <div className="hero-metrics mt-5">
            <div className="metric-tile">
              <div className="truncate text-[12px] font-semibold text-ink-soft">Money in</div>
              <div className="mt-2 stat-num text-[18px] font-semibold text-status-ok">+{formatGBP(incomeTotal)}</div>
            </div>
            <div className="metric-tile">
              <div className="truncate text-[12px] font-semibold text-ink-soft">Off-budget spend</div>
              <div className="mt-2 stat-num text-[18px] font-semibold text-ink">
                {offBudgetTotal > 0 ? "−" : ""}
                {formatGBP(offBudgetTotal)}
              </div>
            </div>
          </div>
        )}
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
            placeholder="Search notes, categories, accounts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search activity"
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

      {(occurrences.length > 0 || wealth.recurring.length > 0) && (
        <DueSection
          occurrences={occurrences}
          ruleCount={wealth.recurring.length}
          describe={describeRule}
          onLog={logNow}
          onReview={(o) => {
            setPrefill({ rule: o.rule, date: o.date, amount: o.amount });
            setEditing(null);
            setOpen(true);
          }}
          onSkip={(o) => {
            skipOccurrence(o.rule.id, o.month);
            showToast(`Skipped ${describeRule(o.rule).title} for ${monthLabel(o.month)}`);
          }}
          onManage={() => setManageOpen(true)}
        />
      )}

      {canAdd && (
        <div
          className="-mx-4 px-4 overflow-x-auto no-scrollbar rise"
          style={{ "--rise-i": 2 } as React.CSSProperties}
          role="tablist"
          aria-label="Filter activity"
        >
          <div className="flex gap-2 pb-1 min-w-min">
            {counts.income > 0 || counts.transfer > 0 || counts.expense > 0 || counts.move > 0 || typeFilter !== "all" ? (
              (["all", "spend", "income", "transfer", "expense", "move"] as const)
                .filter((t) => t === "all" || t === "spend" || counts[t] > 0 || typeFilter === t)
                .map((t) => (
                <FilterChip
                  key={t}
                  label={
                    t === "all"
                      ? "All"
                      : t === "spend"
                        ? "Spending"
                        : t === "income"
                          ? "Income"
                          : t === "transfer"
                            ? "Transfers"
                            : t === "expense"
                              ? "Off-budget"
                              : "Moves"
                  }
                  count={counts[t]}
                  active={filterCat === "all" && typeFilter === t}
                  onClick={() => {
                    setFilterCat("all");
                    setTypeFilter(t);
                  }}
                />
              ))
            ) : (
              <FilterChip
                label="All"
                count={monthEntries.length}
                active={filterCat === "all"}
                onClick={() => setFilterCat("all")}
              />
            )}
            {(typeFilter === "all" || typeFilter === "spend") &&
              budget.categories.map((c) => {
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

      {!canAdd ? (
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
          {query.trim() !== "" || filterCat !== "all" || typeFilter !== "all" ? (
            <>
              <p className="text-[15px] font-semibold text-ink">No matches</p>
              <p className="text-[13px] text-ink-muted mt-1">Try clearing the search or the filter.</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-ink">Nothing logged yet</p>
              <p className="text-[13px] text-ink-muted mt-1">
                Tap <span className="font-semibold text-ink-soft">+ Add</span> to log spending, income or a transfer.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupedByDate.map((group, gi) => {
            const daySpend = roundMoney(group.items.reduce((s, e) => s + (e.kind === "spend" ? e.t.amount : 0), 0));
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
                  <span className="text-[12px] font-semibold text-ink-soft">{group.label}</span>
                  {daySpend !== 0 && (
                    <span className="text-[11px] text-ink-muted stat-num font-medium">{formatGBP(daySpend)} spent</span>
                  )}
                </div>
                <ul role="list" className="ledger-panel">
                  {group.items.map((e) => (
                    <li key={e.id} className="relative z-[1] border-b border-surface-border/60 last:border-b-0">
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3.5 flex items-center gap-3
                          transition hover:bg-surface-sunken/60 active:bg-surface-sunken/80
                          focus-ring"
                        onClick={() =>
                          openEntry(
                            e.kind === "spend"
                              ? { kind: "spend", t: e.t }
                              : e.kind === "move"
                                ? { kind: "move", mv: e.mv }
                                : { kind: "movement", m: e.m },
                          )
                        }
                      >
                        <EntryRow entry={e} categoriesById={categoriesById} accountName={accountName} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <EntryModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        month={month}
        categories={budget.categories}
        defaultCategoryId={lastCategoryId ?? budget.categories[0]?.id ?? null}
        initialKind={budget.categories.length === 0 ? "income" : "spend"}
        prefill={prefill}
      />
      <ManageRepeating open={manageOpen} onClose={() => setManageOpen(false)} describe={describeRule} />
    </div>
  );
}

function EntryRow({
  entry: e,
  categoriesById,
  accountName,
}: {
  entry: Entry;
  categoriesById: Map<string, Category>;
  accountName: (id: string | undefined) => string;
}) {
  if (e.kind === "spend") {
    const cat = categoriesById.get(e.t.categoryId);
    const groupName = cat?.group ?? "Wants";
    const via = e.t.accountId ? ` · ${accountName(e.t.accountId)}` : "";
    return (
      <>
        <CategoryAvatar name={cat?.name ?? "?"} group={groupName} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tight text-ink truncate">
            {e.t.note?.trim() ? e.t.note : (cat?.name ?? "Unknown")}
          </div>
          <div className="text-[11px] text-ink-muted truncate mt-0.5">
            {(e.t.note?.trim() ? cat?.name ?? "Unknown" : groupName) + via}
          </div>
        </div>
        <div className="text-[15px] font-semibold stat-num text-ink whitespace-nowrap">
          {e.t.amount < 0 ? "+" : "−"}
          {formatGBP(Math.abs(e.t.amount))}
        </div>
      </>
    );
  }
  if (e.kind === "income") {
    const m = e.m;
    const label = m.source === "salary" ? "Salary" : "Income";
    return (
      <>
        <MovementAvatar kind="income" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tight text-ink truncate">{m.note?.trim() || label}</div>
          <div className="text-[11px] text-ink-muted truncate mt-0.5">
            {m.note?.trim() ? `${label} · ` : ""}Into {accountName(m.accountId)}
            {m.budgetMonth && ` · ${monthLabel(m.budgetMonth).split(" ")[0]} budget`}
          </div>
        </div>
        <div className="text-[15px] font-semibold stat-num text-status-ok whitespace-nowrap">+{formatGBP(m.amount)}</div>
      </>
    );
  }
  if (e.kind === "expense") {
    const m = e.m;
    return (
      <>
        <MovementAvatar kind="expense" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tight text-ink truncate">{m.note?.trim() || "Off-budget spend"}</div>
          <div className="text-[11px] text-ink-muted truncate mt-0.5">
            {m.note?.trim() ? "Off-budget · " : ""}From {accountName(m.accountId)}
          </div>
        </div>
        <div className="text-[15px] font-semibold stat-num text-ink whitespace-nowrap">−{formatGBP(m.amount)}</div>
      </>
    );
  }
  if (e.kind === "move") {
    const mv = e.mv;
    const name = (id: string) => categoriesById.get(id)?.name ?? "Deleted category";
    const route = `${name(mv.fromCategoryId)} → ${name(mv.toCategoryId)}`;
    return (
      <>
        <MovementAvatar kind="move" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tight text-ink truncate">{mv.note?.trim() || route}</div>
          <div className="text-[11px] text-ink-muted truncate mt-0.5">
            {mv.note?.trim() ? `${route}` : "Budget move"}
            {mv.fromAccountId && mv.toAccountId && ` · ${accountName(mv.fromAccountId)} → ${accountName(mv.toAccountId)}`}
          </div>
        </div>
        <div className="text-[15px] font-semibold stat-num text-ink-soft whitespace-nowrap">{formatGBP(mv.amount)}</div>
      </>
    );
  }
  const m = e.m;
  return (
    <>
      <MovementAvatar kind="transfer" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold tracking-tight text-ink truncate">{m.note?.trim() || "Transfer"}</div>
        <div className="text-[11px] text-ink-muted truncate mt-0.5">
          {accountName(m.fromAccountId)} → {accountName(m.toAccountId)}
        </div>
      </div>
      <div className="text-[15px] font-semibold stat-num text-ink-soft whitespace-nowrap">{formatGBP(m.amount)}</div>
    </>
  );
}

function MovementAvatar({ kind }: { kind: "income" | "transfer" | "expense" | "move" }) {
  const v =
    kind === "income" ? "--c-status-ok" : kind === "expense" ? "--c-debt" : kind === "move" ? "--c-group-savings" : "--c-accent";
  return (
    <div
      className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: `rgb(var(${v}) / 0.14)`,
        color: `rgb(var(${v}))`,
        boxShadow: `inset 0 0 0 1px rgb(var(${v}) / 0.18)`,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {kind === "income" ? (
          <path d="M10 15V5m-4 4 4-4 4 4" />
        ) : kind === "expense" ? (
          <path d="M10 5v10m-4-4 4 4 4-4" />
        ) : kind === "move" ? (
          <path d="M4 10h12m-4-4 4 4-4 4M4 5v10" />
        ) : (
          <path d="M4 7h11l-3-3M16 13H5l3 3" />
        )}
      </svg>
    </div>
  );
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

function DueSection({
  occurrences,
  ruleCount,
  describe,
  onLog,
  onReview,
  onSkip,
  onManage,
}: {
  occurrences: Occurrence[];
  ruleCount: number;
  describe: (r: RecurringRule) => { title: string; subtitle: string };
  onLog: (o: Occurrence) => void;
  onReview: (o: Occurrence) => void;
  onSkip: (o: Occurrence) => void;
  onManage: () => void;
}) {
  return (
    <section className="rise" style={{ "--rise-i": 2 } as React.CSSProperties}>
      <div className="section-row mb-2 px-1">
        <h2 className="section-title">Repeating this month</h2>
        <button
          type="button"
          className="text-[12px] font-medium text-accent hover:underline underline-offset-2"
          onClick={onManage}
        >
          Manage ({ruleCount})
        </button>
      </div>
      {occurrences.length === 0 ? (
        <p className="px-1 text-[12px] text-ink-muted">All logged or skipped for this month.</p>
      ) : (
        <ul role="list" className="ledger-panel rounded-3xl">
          {occurrences.map((o) => {
            const d = describe(o.rule);
            return (
              <li key={o.rule.id} className="relative z-[1] border-b border-surface-border/60 last:border-b-0 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold tracking-tight text-ink">{d.title}</p>
                    <p className="truncate text-[11px] text-ink-muted mt-0.5">
                      <span className={o.status === "due" ? "font-semibold text-status-warn" : ""}>
                        {o.status === "due" ? "Due" : "Upcoming"} {friendlyDayLabel(o.date)}
                      </span>
                      {" · "}
                      {d.subtitle.replace(/^Monthly on the \w+ · /, "")}
                    </p>
                    {o.similarDate && (
                      <p className="text-[11px] text-ink-muted mt-1">
                        Similar entry already logged ({friendlyDayLabel(o.similarDate)}) — skip if that was it.
                      </p>
                    )}
                  </div>
                  <p className="text-[14px] font-semibold text-ink stat-num whitespace-nowrap">
                    {o.amount === null ? "Nothing owed" : formatGBP(o.amount)}
                  </p>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    className="btn-accent btn-sm"
                    disabled={o.amount === null}
                    onClick={() => onLog(o)}
                  >
                    Log
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => onReview(o)}>
                    Edit &amp; log
                  </button>
                  <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => onSkip(o)}>
                    Skip
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ManageRepeating({
  open,
  onClose,
  describe,
}: {
  open: boolean;
  onClose: () => void;
  describe: (r: RecurringRule) => { title: string; subtitle: string };
}) {
  const rules = useAppStore((s) => s.wealth.recurring);
  const setPaused = useAppStore((s) => s.setRecurringPaused);
  const deleteRecurring = useAppStore((s) => s.deleteRecurring);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <Modal open={open} onClose={onClose} title="Repeating entries">
      {rules.length === 0 ? (
        <p className="text-[13px] text-ink-soft leading-snug">
          None yet. When adding an entry, tick "Repeat every month" to get a reminder each month.
        </p>
      ) : (
        <ul role="list" className="divide-y divide-surface-border/70">
          {rules.map((r) => {
            const d = describe(r);
            const fixed = !(r.template.kind === "transfer" && r.template.payFullBalance);
            return (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-[14px] font-semibold ${r.paused ? "text-ink-muted" : "text-ink"}`}>
                      {d.title}
                      {r.paused && " · Paused"}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5 leading-snug">{d.subtitle}</p>
                  </div>
                  <p className="text-[14px] font-semibold text-ink stat-num whitespace-nowrap">
                    {fixed ? formatGBP(r.template.amount) : "Full balance"}
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setPaused(r.id, !r.paused)}>
                    {r.paused ? "Resume" : "Pause"}
                  </button>
                  {confirmId === r.id ? (
                    <button
                      type="button"
                      className="btn-danger btn-sm ml-auto"
                      onClick={() => {
                        deleteRecurring(r.id);
                        setConfirmId(null);
                        showToast("Repeating entry removed — past entries are kept");
                      }}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost btn-sm ml-auto text-status-over" onClick={() => setConfirmId(r.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-ink-muted leading-snug">
        To change an amount or account, remove the rule and add a new entry with "Repeat every month" ticked.
      </p>
    </Modal>
  );
}
