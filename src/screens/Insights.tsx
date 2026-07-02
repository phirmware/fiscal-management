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
        className="seg grid-cols-3 print:hidden"
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
              className="seg-btn tap !py-2.5"
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
