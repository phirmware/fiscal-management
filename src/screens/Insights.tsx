import { useState } from "react";
import { FlowScreen } from "./Flow.js";
import { ReportsScreen } from "./Reports.js";
import { SavingsScreen } from "./Savings.js";

type Tab = "savings" | "flow" | "reports";

const TABS: { id: Tab; label: string }[] = [
  { id: "savings", label: "Savings" },
  { id: "flow", label: "Flow" },
  { id: "reports", label: "Reports" },
];

export function InsightsScreen() {
  const [tab, setTab] = useState<Tab>("savings");

  return (
    <div className="flex flex-col gap-4">
      <div
        className="card p-1 grid grid-cols-3 gap-1 print:hidden bg-surface-sunken/60
          border-surface-border/70"
        role="tablist"
        aria-label="Insights sub-navigation"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`tap text-[13px] font-semibold rounded-xl py-2.5 transition
                ${
                  active
                    ? "bg-surface-card text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink-soft"
                }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "savings" && <SavingsScreen />}
      {tab === "flow" && <FlowScreen />}
      {tab === "reports" && <ReportsScreen />}
    </div>
  );
}
