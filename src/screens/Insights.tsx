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
    <div className="flex flex-col gap-6">
      <div
        className="p-1 grid grid-cols-3 gap-1 print:hidden rounded-2xl bg-surface-sunken
          border border-surface-border/60"
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
                ${active ? "pill-active" : "text-ink-muted hover:text-ink-soft"}`}
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
