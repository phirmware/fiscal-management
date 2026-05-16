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
      <div className="card p-1 grid grid-cols-3 gap-1 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`tap text-sm font-semibold rounded-xl py-2 ${
              tab === t.id ? "bg-ink text-surface" : "text-ink-muted"
            }`}
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "savings" && <SavingsScreen />}
      {tab === "flow" && <FlowScreen />}
      {tab === "reports" && <ReportsScreen />}
    </div>
  );
}
