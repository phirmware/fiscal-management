import { useMemo } from "react";
import { computeMonth } from "../engine.js";
import { buildFlow } from "../app/insights.js";
import { useAppStore } from "../app/store.js";
import { useBudgetView } from "../app/effectiveBudget.js";
import { monthLabel } from "../app/utils/month.js";
import { formatGBP } from "../app/utils/money.js";
import { FlowDiagram } from "../components/FlowDiagram.js";

export function FlowScreen() {
  const { effective } = useBudgetView();
  const month = useAppStore((s) => s.ui.selectedMonth);

  const flow = useMemo(() => {
    const m = computeMonth(effective, month);
    return buildFlow(effective, m);
  }, [effective, month]);

  const allocated = flow.nodes
    .filter((n) => n.column === 1 && n.id !== "unassigned")
    .reduce((s, n) => s + n.amount, 0);
  const unassigned = flow.nodes.find((n) => n.id === "unassigned")?.amount ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero holo-panel p-6">
        <span className="section-eyebrow">{monthLabel(month)} · income flow</span>
        {flow.totalIncome <= 0 ? (
          <p className="text-[14px] text-ink-soft mt-3 leading-snug">
            Set this month's income on Home to see where the money is going.
          </p>
        ) : (
          <>
            <div className="mt-2">
              <h2 className="text-display-xl text-balance-gradient stat-num">
                {formatGBP(flow.totalIncome)}
              </h2>
            </div>
            <div className="mt-5 pt-4 border-t border-surface-border grid grid-cols-2 gap-4">
              <div>
                <div className="section-eyebrow text-ink-muted">Allocated</div>
                <div className="mt-1.5 text-[18px] font-semibold stat-num text-ink">
                  {formatGBP(allocated)}
                </div>
              </div>
              <div className="text-right">
                <div className="section-eyebrow text-ink-muted">Not yet assigned</div>
                <div className="mt-1.5 text-[18px] font-semibold stat-num text-ink">
                  {formatGBP(unassigned)}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="px-1">
        <div className="section-row mb-4">
          <h2 className="section-title">Flow</h2>
        </div>
        <div className="card p-4">
          <FlowDiagram graph={flow} />
        </div>
        <p className="text-[11px] text-ink-muted mt-3 px-1 leading-snug">
          Ribbon thickness reflects amount. Needs and Wants use what was spent;
          Savings uses the larger of budget or activities.
        </p>
      </section>
    </div>
  );
}
