import { useMemo } from "react";
import { computeMonth } from "../engine.js";
import { buildFlow } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { monthLabel } from "../app/utils/month.js";
import { formatGBP } from "../app/utils/money.js";
import { FlowDiagram } from "../components/FlowDiagram.js";

export function FlowScreen() {
  const budget = useAppStore((s) => s.budget);
  const month = useAppStore((s) => s.ui.selectedMonth);

  const flow = useMemo(() => {
    const m = computeMonth(budget, month);
    return buildFlow(budget, m);
  }, [budget, month]);

  const allocated = flow.nodes
    .filter((n) => n.column === 1 && n.id !== "unassigned")
    .reduce((s, n) => s + n.amount, 0);
  const unassigned = flow.nodes.find((n) => n.id === "unassigned")?.amount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink-soft">{monthLabel(month)} flow</h2>
        {flow.totalIncome <= 0 ? (
          <p className="text-sm text-ink-muted mt-2">
            Set this month's income on Home to see where the money is going.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-ink-muted">Income</div>
              <div className="font-semibold tabular-nums">{formatGBP(flow.totalIncome)}</div>
            </div>
            <div>
              <div className="text-ink-muted">Allocated</div>
              <div className="font-semibold tabular-nums">{formatGBP(allocated)}</div>
            </div>
            <div>
              <div className="text-ink-muted">Not yet assigned</div>
              <div className="font-semibold tabular-nums">{formatGBP(unassigned)}</div>
            </div>
          </div>
        )}
      </section>

      <section className="card p-2">
        <FlowDiagram graph={flow} />
      </section>

      <p className="text-xs text-ink-muted px-1">
        Ribbon thickness reflects amount. Categories with zero spend are hidden.
        Savings entries flow into the Savings group; unbudgeted income lands in
        "Not yet assigned".
      </p>
    </div>
  );
}
