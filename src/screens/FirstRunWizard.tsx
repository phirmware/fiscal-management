import { useMemo, useState } from "react";
import { useAppStore } from "../app/store.js";
import { currentMonth } from "../app/state.js";
import { formatGBP, parseMoneyInput } from "../app/utils/money.js";
import { monthLabel } from "../app/utils/month.js";
import type { CategoryType, Group } from "../types.js";

interface StarterCategory {
  name: string;
  group: Group;
  type: CategoryType;
  defaultPctOfIncome: number;
}

const STARTERS: StarterCategory[] = [
  { name: "Rent", group: "Needs", type: "Limit", defaultPctOfIncome: 0.3 },
  { name: "Groceries", group: "Needs", type: "Limit", defaultPctOfIncome: 0.1 },
  { name: "Subscriptions", group: "Needs", type: "Limit", defaultPctOfIncome: 0.03 },
  { name: "Eating out", group: "Wants", type: "Limit", defaultPctOfIncome: 0.05 },
  { name: "Fun money", group: "Wants", type: "Limit", defaultPctOfIncome: 0.05 },
  { name: "Gifts", group: "Wants", type: "Pot", defaultPctOfIncome: 0.02 },
  { name: "Travel", group: "Wants", type: "Pot", defaultPctOfIncome: 0.05 },
  { name: "Car maintenance", group: "Needs", type: "Pot", defaultPctOfIncome: 0.04 },
  { name: "Home maintenance", group: "Needs", type: "Pot", defaultPctOfIncome: 0.03 },
  { name: "Emergency fund", group: "Savings", type: "Pot", defaultPctOfIncome: 0.1 },
  { name: "Retirement", group: "Savings", type: "Pot", defaultPctOfIncome: 0.05 },
  { name: "House deposit", group: "Savings", type: "Pot", defaultPctOfIncome: 0.05 },
];

type Selection = Record<string, { selected: boolean; amount: string }>;

export function FirstRunWizard() {
  const setIncome = useAppStore((s) => s.setIncome);
  const addCategory = useAppStore((s) => s.addCategory);
  const setBudget = useAppStore((s) => s.setBudget);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const month = currentMonth();
  const [incomeDraft, setIncomeDraft] = useState("");
  const [selection, setSelection] = useState<Selection>(() =>
    Object.fromEntries(STARTERS.map((s) => [s.name, { selected: true, amount: "" }])),
  );

  const income = parseMoneyInput(incomeDraft) ?? 0;

  const benchmark = useMemo(
    () => ({ needs: income * 0.5, wants: income * 0.3, savings: income * 0.2 }),
    [income],
  );

  function suggestedAmount(s: StarterCategory): number {
    if (income <= 0) return 0;
    return Math.round(income * s.defaultPctOfIncome);
  }

  function toggle(name: string) {
    setSelection((prev) => ({ ...prev, [name]: { ...prev[name]!, selected: !prev[name]!.selected } }));
  }

  function setAmount(name: string, value: string) {
    setSelection((prev) => ({ ...prev, [name]: { ...prev[name]!, amount: value } }));
  }

  function finish() {
    if (income > 0) setIncome(month, income);
    for (const s of STARTERS) {
      const choice = selection[s.name];
      if (!choice || !choice.selected) continue;
      const id = addCategory({
        name: s.name,
        group: s.group,
        type: s.type,
        fromMonth: month,
      });
      const userAmount = parseMoneyInput(choice.amount);
      const amount = userAmount !== null ? userAmount : suggestedAmount(s);
      if (amount > 0) setBudget(id, month, amount);
    }
    completeOnboarding();
  }

  return (
    <div className="min-h-full flex flex-col items-center pb-safe">
      <div className="w-full max-w-phone flex flex-col gap-6 p-4">
        <header className="pt-6">
          <span className="section-eyebrow text-accent">Welcome</span>
          <h1 className="text-display-xl text-balance-gradient tracking-tight mt-2">
            Plan with intent.
          </h1>
          <p className="text-[14px] text-ink-soft mt-3 leading-relaxed max-w-[22rem]">
            Two quick steps. Everything stays on this device — no account, no sync, ever.
          </p>
        </header>

        <section className="card-hero p-6">
          <div className="flex items-baseline gap-3">
            <span
              className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 text-accent
                flex items-center justify-center text-[13px] font-semibold"
            >
              1
            </span>
            <h2 className="text-[16px] font-semibold tracking-tight text-ink">
              Monthly net income
            </h2>
          </div>
          <p className="text-[12px] text-ink-muted mt-2 ml-10 leading-snug">
            After tax. We'll use this for the 50/30/20 starting point.
          </p>
          <div className="relative mt-4">
            <span
              className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted
                text-xl font-semibold pointer-events-none stat-num"
              aria-hidden="true"
            >
              £
            </span>
            <input
              className="input-base !pl-9 text-2xl font-semibold stat-num"
              inputMode="decimal"
              value={incomeDraft}
              onChange={(e) => setIncomeDraft(e.target.value)}
              placeholder="2500"
              autoFocus
            />
          </div>
          {income > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Tile label="Needs · 50%" value={formatGBP(benchmark.needs)} dot="bg-group-needs" />
              <Tile label="Wants · 30%" value={formatGBP(benchmark.wants)} dot="bg-group-wants" />
              <Tile
                label="Savings · 20%"
                value={formatGBP(benchmark.savings)}
                dot="bg-group-savings"
              />
            </div>
          )}
          <p className="text-[11px] text-ink-muted mt-3 leading-snug">
            A rough benchmark — not pass/fail. Adjust to your reality.
          </p>
        </section>

        <section className="card p-6">
          <div className="flex items-baseline gap-3">
            <span
              className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 text-accent
                flex items-center justify-center text-[13px] font-semibold"
            >
              2
            </span>
            <h2 className="text-[16px] font-semibold tracking-tight text-ink">
              Starter categories
            </h2>
          </div>
          <p className="text-[12px] text-ink-muted mt-2 ml-10 leading-snug">
            Tick what fits. Budgets prefilled from a rough split of income; edit to taste.
          </p>
          <ul className="mt-4 flex flex-col">
            {STARTERS.map((s) => {
              const ch = selection[s.name]!;
              const suggestion = suggestedAmount(s);
              return (
                <li
                  key={s.name}
                  className="flex items-center gap-3 py-3 border-b border-surface-border
                    last:border-b-0"
                >
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-accent rounded"
                    checked={ch.selected}
                    onChange={() => toggle(s.name)}
                    aria-label={`Include ${s.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-ink truncate">{s.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="pill bg-surface-sunken text-ink-muted">{s.type}</span>
                      <span className="text-[11px] text-ink-muted">{s.group}</span>
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-base !py-1.5 !px-2 !text-[13px] font-semibold w-20 stat-num"
                    value={ch.amount}
                    onChange={(e) => setAmount(s.name, e.target.value)}
                    placeholder={suggestion > 0 ? String(suggestion) : "0"}
                    disabled={!ch.selected}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <div className="sticky bottom-0 pb-safe pt-4 -mx-4 px-4 scrim">
          <button type="button" className="btn-accent w-full" onClick={finish}>
            Get started — {monthLabel(month)}
          </button>
          <button
            type="button"
            className="btn-ghost w-full mt-2 text-[12px]"
            onClick={completeOnboarding}
          >
            Skip and start empty
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="rounded-2xl bg-surface-sunken/70 border border-surface-border/60 p-3">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">
          {label}
        </span>
      </div>
      <div className="mt-1.5 text-[14px] font-semibold stat-num text-ink">{value}</div>
    </div>
  );
}
