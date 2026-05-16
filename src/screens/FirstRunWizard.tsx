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
];

type Selection = Record<string, { selected: boolean; amount: string }>;

export function FirstRunWizard() {
  const setIncome = useAppStore((s) => s.setIncome);
  const addCategory = useAppStore((s) => s.addCategory);
  const setBudget = useAppStore((s) => s.setBudget);
  const addSavingsAccount = useAppStore((s) => s.addSavingsAccount);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const month = currentMonth();
  const [incomeDraft, setIncomeDraft] = useState("");
  const [savingsName, setSavingsName] = useState("Emergency fund");
  const [savingsOn, setSavingsOn] = useState(true);
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
    if (savingsOn && savingsName.trim()) {
      addSavingsAccount({ name: savingsName.trim(), startingBalance: 0 });
    }
    completeOnboarding();
  }

  return (
    <div className="min-h-full bg-surface flex flex-col items-center pb-safe">
      <div className="w-full max-w-phone flex flex-col gap-4 p-4">
        <header>
          <h1 className="text-xl font-semibold">Welcome</h1>
          <p className="text-sm text-ink-soft mt-1">
            Three quick steps. Everything stays on this device — no account, no sync.
          </p>
        </header>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-soft">1. Monthly net income</h2>
          <p className="text-xs text-ink-muted mt-1">
            After tax. We'll use this for the 50/30/20 starting point.
          </p>
          <input
            className="input-base mt-3 text-lg font-semibold"
            inputMode="decimal"
            value={incomeDraft}
            onChange={(e) => setIncomeDraft(e.target.value)}
            placeholder="e.g. 2500"
            autoFocus
          />
          {income > 0 && (
            <div className="mt-3 text-xs text-ink-soft grid grid-cols-3 gap-2">
              <Tile label="Needs (50%)" value={formatGBP(benchmark.needs)} colour="text-group-needs" />
              <Tile label="Wants (30%)" value={formatGBP(benchmark.wants)} colour="text-group-wants" />
              <Tile label="Savings (20%)" value={formatGBP(benchmark.savings)} colour="text-group-savings" />
            </div>
          )}
          <p className="text-xs text-ink-muted mt-2">
            A rough benchmark — not pass/fail. Adjust to your reality.
          </p>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-soft">2. Starter categories</h2>
          <p className="text-xs text-ink-muted mt-1">
            Tick what fits. Budgets are pre-filled from a rough split of income; edit any to taste.
            You can change all of this later.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {STARTERS.map((s) => {
              const ch = selection[s.name]!;
              const suggestion = suggestedAmount(s);
              return (
                <li key={s.name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="tap"
                    checked={ch.selected}
                    onChange={() => toggle(s.name)}
                    aria-label={`Include ${s.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">{s.name}</span>
                      <span className="pill bg-surface-sunken text-ink-muted">{s.type}</span>
                      <span className="text-xs text-ink-muted">{s.group}</span>
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-base !py-1 !px-2 text-sm w-24"
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

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-soft">3. Savings account (optional)</h2>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="tap"
              checked={savingsOn}
              onChange={() => setSavingsOn((v) => !v)}
            />
            Create an account named:
          </label>
          <input
            className="input-base mt-2"
            value={savingsName}
            onChange={(e) => setSavingsName(e.target.value)}
            disabled={!savingsOn}
          />
          <p className="text-xs text-ink-muted mt-2">
            You'll log monthly contributions on the Insights → Savings tab.
          </p>
        </section>

        <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)] pt-2 bg-surface">
          <button type="button" className="btn-primary w-full" onClick={finish}>
            Get started — {monthLabel(month)}
          </button>
          <button
            type="button"
            className="btn-ghost w-full mt-2 text-xs"
            onClick={completeOnboarding}
          >
            Skip and start empty
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken p-2">
      <div className={`text-[10px] uppercase tracking-wide ${colour}`}>{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
