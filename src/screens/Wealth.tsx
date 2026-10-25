import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useBudgetView } from "../app/effectiveBudget.js";
import { useAppStore } from "../app/store.js";
import type { AccountKind, WealthAccount } from "../app/state.js";
import type { AccountView, AssetClass } from "../app/wealth.js";
import {
  ASSET_CLASSES,
  ASSET_CLASS_META,
  KIND_META,
  LIABILITY_KINDS,
  accountViews,
  firstSnapshotDate,
  healthReport,
  monthEnd,
  netWorthSeries,
  projectPayoff,
} from "../app/wealth.js";
import { formatGBP, formatGBPShort, roundMoney } from "../app/utils/money.js";
import { addMonths, friendlyDayLabel, monthLabel, todayIso } from "../app/utils/month.js";
import { AccountDetail } from "../components/AccountDetail.js";
import { AccountForm } from "../components/AccountForm.js";
import { AllocationDonut } from "../components/AllocationDonut.js";
import { AnimatedGBP } from "../components/AnimatedNumber.js";
import { FlagList, MetricList, ScoreRing, scoreLabel } from "../components/HealthPanel.js";
import { NetWorthChart } from "../components/NetWorthChart.js";
import { Sparkline } from "../components/Sparkline.js";
import { UpdateBalances } from "../components/UpdateBalances.js";

type Tab = "overview" | "accounts" | "health";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "health", label: "Health" },
];

const rise = (i: number) => ({ "--rise-i": i }) as CSSProperties;

function signedShort(n: number): string {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + formatGBP(Math.abs(n)).replace(/\.00$/, "");
}

export function WealthScreen() {
  const wealth = useAppStore((s) => s.wealth);
  const month = useAppStore((s) => s.ui.selectedMonth);
  const { effective } = useBudgetView();
  const today = todayIso();

  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<6 | 12 | 24 | 0>(12);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WealthAccount | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const asOf = monthEnd(month);
  const views = useMemo(() => accountViews(wealth, asOf, today), [wealth, asOf, today]);
  // The detail sheet always shows the full, latest history — not the month-clipped view.
  const latestViews = useMemo(() => accountViews(wealth, "9999-12-31", today), [wealth, today]);
  const report = useMemo(
    () => healthReport({ wealth, budget: effective, month, today }),
    [wealth, effective, month, today],
  );

  const first = firstSnapshotDate(wealth);
  const rangeFrom = useMemo(() => {
    if (range !== 0) return addMonths(month, -(range - 1));
    const start = first ? first.slice(0, 7) : month;
    // "All" still shows at least six months so a new tracker isn't one lonely bar.
    return start < addMonths(month, -5) ? start : addMonths(month, -5);
  }, [range, month, first]);
  const series = useMemo(() => netWorthSeries(wealth, rangeFrom, month), [wealth, rangeFrom, month]);
  const spark = useMemo(
    () => netWorthSeries(wealth, addMonths(month, -11), month).filter((p) => p.hasData),
    [wealth, month],
  );

  const now = report.current;
  const prev = spark.length >= 2 ? spark[spark.length - 2]! : null;
  const monthDelta = prev ? roundMoney(now.netWorth - prev.netWorth) : null;
  const yearDelta = spark.length >= 2 ? roundMoney(now.netWorth - spark[0]!.netWorth) : null;

  const hasAccounts = wealth.accounts.length > 0;
  const detailView = latestViews.find((v) => v.account.id === detailId) ?? null;
  const isPast = asOf < today;

  if (!hasAccounts) {
    return (
      <>
        <EmptyWealth onAdd={() => setFormOpen(true)} />
        <AccountForm open={formOpen} onClose={() => setFormOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero holo-panel p-6 rise" style={rise(0)}>
        <div className="absolute inset-x-6 top-0 h-1 ledger-strip opacity-70" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-eyebrow">Net worth</p>
            <p className="text-[11px] text-ink-muted mt-0.5">
              {isPast ? `End of ${monthLabel(month)}` : "Today"}
            </p>
          </div>
          {spark.length >= 2 && <Sparkline values={spark.map((p) => p.netWorth)} className="w-24 h-9 shrink-0" />}
        </div>
        <h2 className="mt-2 text-display-xl text-balance-gradient stat-num">
          <AnimatedGBP value={now.netWorth} />
        </h2>
        {(monthDelta !== null || yearDelta !== null) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {monthDelta !== null && <DeltaPill value={monthDelta} label="vs last month" />}
            {yearDelta !== null && spark.length > 2 && (
              <DeltaPill value={yearDelta} label={spark.length >= 12 ? "12 months" : `${spark.length - 1} months`} />
            )}
          </div>
        )}
        <div className="hero-metrics mt-5">
          <div className="metric-tile">
            <div className="truncate text-[12px] font-semibold text-ink-soft">Assets</div>
            <div className="mt-2 stat-num text-[18px] font-semibold text-ink">{formatGBP(now.assets)}</div>
          </div>
          <div className="metric-tile">
            <div className="truncate text-[12px] font-semibold text-ink-soft">Debts</div>
            <div className="mt-2 stat-num text-[18px] font-semibold text-debt">
              {now.liabilities > 0 ? "−" : ""}
              {formatGBP(now.liabilities)}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-accent" onClick={() => setBulkOpen(true)}>
            Update balances
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + Add account
          </button>
        </div>
      </section>

      <div className="seg grid-cols-3 rise" style={rise(1)} role="tablist" aria-label="Wealth sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="seg-btn tap !py-2.5"
          >
            {t.label}
            {t.id === "health" && report.flags.some((f) => f.severity === "critical") && (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-status-over align-middle" aria-label="has red flags" />
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {report.flags.filter((f) => f.severity !== "win").length > 0 && (
            <section className="rise" style={rise(2)}>
              <div className="section-row mb-3 px-1">
                <h2 className="section-title">Worth your attention</h2>
                <button
                  type="button"
                  className="text-[12px] font-medium text-accent hover:underline underline-offset-2"
                  onClick={() => setTab("health")}
                >
                  Health check →
                </button>
              </div>
              <FlagList flags={report.flags.filter((f) => f.severity !== "win")} limit={3} />
            </section>
          )}

          <section className="dashboard-band rise" style={rise(3)}>
            <div className="section-row mb-4">
              <div>
                <h2 className="section-title">Net worth trend</h2>
                <p className="text-[12px] text-ink-muted mt-0.5">Month-end balances. Tap a bar to inspect.</p>
              </div>
              <div className="flex gap-1 p-1 rounded-xl bg-surface-sunken border border-surface-border/60 shrink-0">
                {([6, 12, 24, 0] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`text-[12px] px-2 py-1 rounded-lg transition font-semibold focus-ring ${
                      range === n ? "pill-active" : "text-ink-muted hover:text-ink"
                    }`}
                    onClick={() => setRange(n)}
                    aria-pressed={range === n}
                  >
                    {n === 0 ? "All" : `${n}m`}
                  </button>
                ))}
              </div>
            </div>
            <NetWorthChart points={series} />
          </section>

          {now.assets > 0 && (
            <section className="dashboard-band rise" style={rise(4)}>
              <div className="section-row mb-4">
                <div>
                  <h2 className="section-title">Where your money sits</h2>
                  <p className="text-[12px] text-ink-muted mt-0.5">Assets by type.</p>
                </div>
              </div>
              <AllocationDonut byClass={now.byClass} />
              <LiquidityBar byClass={now.byClass} />
            </section>
          )}

          <QuickStats report={report} />
        </>
      )}

      {tab === "accounts" && (
        <>
          <AccountGroups views={views} onOpen={setDetailId} />
          <DebtPlan views={views} />
        </>
      )}

      {tab === "health" && (
        <>
          <section className="dashboard-band rise" style={rise(2)}>
            {report.score !== null ? (
              <div className="flex items-center gap-4">
                <ScoreRing score={report.score} />
                <div className="min-w-0">
                  <p className="section-eyebrow">Financial health</p>
                  <p
                    className="text-[20px] font-semibold tracking-tight mt-0.5"
                    style={{ color: `rgb(var(${scoreLabel(report.score).colourVar}))` }}
                  >
                    {scoreLabel(report.score).label}
                  </p>
                  <p className="text-[12px] text-ink-muted mt-0.5 leading-snug">
                    Blended from {report.metrics.filter((m) => m.status !== "na" && m.status !== "neutral").length} measures below.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="section-eyebrow">Financial health</p>
                <p className="text-[13px] text-ink-soft mt-1 leading-snug">
                  Add income on Home, a few months of spending, and your account balances to unlock a health score.
                </p>
              </div>
            )}
          </section>

          {report.flags.length > 0 && (
            <section className="rise" style={rise(3)}>
              <h2 className="section-title mb-3 px-1">Flags</h2>
              <FlagList flags={report.flags} />
            </section>
          )}

          <section className="dashboard-band rise" style={rise(4)}>
            <div className="mb-4">
              <h2 className="section-title">Health check</h2>
              <p className="text-[12px] text-ink-muted mt-0.5">
                The numbers that say whether you're on track. Rules of thumb, not advice.
              </p>
            </div>
            <MetricList metrics={report.metrics} />
          </section>
          <p className="text-[11px] text-ink-muted px-1 -mt-2 leading-snug">
            Spending figures come from your budget: Needs + Wants, averaged over recent complete months.
            Add your age and salary in Settings for a retirement benchmark.
          </p>
        </>
      )}

      <AccountForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
      {!formOpen && (
        <AccountDetail
          view={detailView}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditing(detailView?.account ?? null);
            setFormOpen(true);
          }}
        />
      )}
      <UpdateBalances open={bulkOpen} onClose={() => setBulkOpen(false)} views={latestViews} />
    </div>
  );
}

function DeltaPill({ value, label }: { value: number; label: string }) {
  const v = value > 0 ? "--c-status-ok" : value < 0 ? "--c-status-over" : "--c-ink-muted";
  return (
    <span
      className="pill gap-1 px-2.5 py-1 stat-num"
      style={{ background: `rgb(var(${v}) / 0.12)`, color: `rgb(var(${v}))` }}
    >
      <span className="font-semibold">{signedShort(value)}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

/** Accessible now vs. locked away — the split that matters in an emergency. */
function LiquidityBar({ byClass }: { byClass: Record<AssetClass, number> }) {
  const liquid = byClass.cash;
  const market = byClass.invest;
  const locked = byClass.pension + byClass.property + byClass.other;
  const total = liquid + market + locked;
  if (total <= 0) return null;
  const parts = [
    { label: "Cash now", value: liquid, cls: "bg-asset-cash" },
    { label: "Sellable in days", value: market, cls: "bg-asset-invest" },
    { label: "Locked away", value: locked, cls: "bg-asset-other" },
  ].filter((p) => p.value > 0);
  return (
    <div className="mt-5 pt-4 border-t border-surface-border/70">
      <p className="section-eyebrow mb-2">How quickly you could reach it</p>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {parts.map((p) => (
          <div key={p.label} className={`${p.cls} bar-anim`} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="min-w-0">
            <dt className="truncate text-[11px] text-ink-muted">{p.label}</dt>
            <dd className="text-[13px] font-semibold text-ink stat-num">{formatGBPShort(p.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuickStats({ report }: { report: ReturnType<typeof healthReport> }) {
  const pick = ["emergency", "savings-rate", "dti", "fi"]
    .map((id) => report.metrics.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m && m.status !== "na");
  if (pick.length === 0) return null;
  const tone: Record<string, string> = {
    good: "text-status-ok",
    ok: "text-ink",
    warn: "text-status-warn",
    bad: "text-status-over",
    neutral: "text-ink",
    na: "text-ink-muted",
  };
  return (
    <section className="grid grid-cols-2 gap-3 rise" style={rise(5)}>
      {pick.map((m) => (
        <div key={m.id} className="card p-4">
          <p className="truncate text-[12px] font-semibold text-ink-muted">{m.label}</p>
          <p className={`mt-1.5 text-[22px] font-semibold tracking-tight stat-num ${tone[m.status]}`}>{m.value}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-muted">{m.target}</p>
        </div>
      ))}
    </section>
  );
}

const GROUPS: { title: string; colourVar: string; match: (k: AccountKind) => boolean }[] = [
  ...ASSET_CLASSES.map((c) => ({
    title: ASSET_CLASS_META[c].label,
    colourVar: ASSET_CLASS_META[c].colourVar,
    match: (k: AccountKind) => KIND_META[k].assetClass === c,
  })),
  { title: "Debts", colourVar: "--c-debt", match: (k: AccountKind) => LIABILITY_KINDS.includes(k) },
];

function AccountGroups({ views, onOpen }: { views: AccountView[]; onOpen: (id: string) => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = views.filter((v) => v.account.archived).length;
  const visible = views.filter((v) => showArchived || !v.account.archived);

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g, gi) => {
        const items = visible
          .filter((v) => g.match(v.account.kind))
          .sort((a, b) => Math.abs(b.balance ?? 0) - Math.abs(a.balance ?? 0));
        if (items.length === 0) return null;
        const total = roundMoney(items.reduce((s, v) => s + (v.balance ?? 0), 0));
        const isDebt = g.title === "Debts";
        return (
          <section key={g.title} className="rise" style={rise(gi + 2)}>
            <div className="section-row mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: `rgb(var(${g.colourVar}))` }} aria-hidden="true" />
                <h2 className="section-title">{g.title}</h2>
              </div>
              <p className={`text-[13px] font-semibold stat-num ${isDebt ? "text-debt" : "text-ink-soft"}`}>
                {isDebt && total > 0 ? "−" : ""}
                {formatGBP(total)}
              </p>
            </div>
            <ul role="list" className="ledger-panel rounded-3xl">
              {items.map((v) => (
                <li key={v.account.id} className="ledger-row !p-0">
                  <button
                    type="button"
                    onClick={() => onOpen(v.account.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-sunken/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[14px] font-semibold tracking-tight ${v.account.archived ? "text-ink-muted" : "text-ink"}`}>
                        {v.account.name}
                      </p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {KIND_META[v.account.kind].label}
                        {v.account.emergencyFund && " · Emergency fund"}
                        {v.account.archived && " · Archived"}
                        {v.lastUpdated && (
                          <span className={v.daysSinceUpdate !== null && v.daysSinceUpdate > 35 ? "text-status-warn" : ""}>
                            {" · "}
                            {friendlyDayLabel(v.lastUpdated)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[14px] font-semibold stat-num ${isDebt ? "text-debt" : "text-ink"}`}>
                        {v.balance === null ? "—" : (isDebt && v.balance > 0 ? "−" : "") + formatGBP(Math.abs(v.balance))}
                      </p>
                      {v.change !== null && v.change !== 0 && (
                        <p
                          className={`text-[11px] stat-num ${
                            (isDebt ? -v.change : v.change) > 0 ? "text-status-ok" : "text-status-over"
                          }`}
                        >
                          {v.change > 0 ? "+" : "−"}
                          {formatGBPShort(Math.abs(v.change))}
                        </p>
                      )}
                    </div>
                    <svg viewBox="0 0 20 20" className="size-4 text-ink-faint shrink-0" aria-hidden="true">
                      <path d="M7.5 5 12.5 10l-5 5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {archivedCount > 0 && (
        <button
          type="button"
          className="self-start px-1 text-[12px] font-semibold text-accent hover:underline underline-offset-2"
          onClick={() => setShowArchived((s) => !s)}
        >
          {showArchived ? "Hide archived" : `Show ${archivedCount} archived`}
        </button>
      )}
    </div>
  );
}

/** Avalanche order (highest APR first) with a projected debt-free date for each. */
function DebtPlan({ views }: { views: AccountView[] }) {
  const debts = views
    .filter((v) => !v.account.archived && KIND_META[v.account.kind].liability && (v.balance ?? 0) > 0)
    .sort((a, b) => (b.account.rate ?? 0) - (a.account.rate ?? 0));
  if (debts.length === 0) return null;
  const startMonth = todayIso().slice(0, 7);
  const rows = debts.map((v) => ({
    v,
    p: (v.account.monthlyPayment ?? 0) > 0 ? projectPayoff(v.balance ?? 0, v.account.rate ?? 0, v.account.monthlyPayment ?? 0) : null,
  }));
  const finite = rows.filter((r) => r.p?.months != null).map((r) => r.p!.months!);
  const allProjected = rows.every((r) => r.p?.months != null);
  const lastMonth = allProjected && finite.length > 0 ? addMonths(startMonth, Math.max(...finite)) : null;
  const totalInterest = rows.reduce((s, r) => s + (r.p?.totalInterest ?? 0), 0);

  return (
    <section className="dashboard-band rise" style={rise(9)}>
      <div className="mb-4">
        <h2 className="section-title">Debt payoff plan</h2>
        <p className="text-[12px] text-ink-muted mt-0.5">
          Highest interest first — the order that costs you least.
        </p>
      </div>
      {lastMonth && (
        <div className="mb-4 rounded-2xl bg-surface-sunken/60 px-4 py-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-ink-muted">Debt-free by</p>
            <p className="text-[18px] font-semibold tracking-tight text-ink">{monthLabel(lastMonth)}</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold text-ink-muted">Interest to go</p>
            <p className="text-[15px] font-semibold text-ink stat-num">{formatGBP(totalInterest)}</p>
          </div>
        </div>
      )}
      <ol role="list" className="flex flex-col gap-3">
        {rows.map(({ v, p }, i) => (
          <li key={v.account.id} className="flex items-start gap-3">
            <span className="mt-0.5 size-5 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 bg-debt/15 text-debt">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-semibold text-ink">{v.account.name}</p>
                <p className="text-[13px] font-semibold text-ink stat-num whitespace-nowrap">{formatGBP(v.balance ?? 0)}</p>
              </div>
              <p className="text-[11px] text-ink-muted leading-snug">
                {v.account.rate ? `${v.account.rate}% APR` : "Rate not set"}
                {" · "}
                {p === null
                  ? "Add a monthly repayment to project"
                  : p.months === null
                    ? <span className="text-status-over font-semibold">Payment doesn't cover interest</span>
                    : `${formatGBPShort(v.account.monthlyPayment ?? 0)}/mo → clear ${monthLabel(addMonths(startMonth, p.months))}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EmptyWealth({ onAdd }: { onAdd: () => void }) {
  const items: { cls: string; title: string; body: string }[] = [
    { cls: "bg-asset-cash", title: "Cash", body: "Current accounts, savings, cash ISAs" },
    { cls: "bg-asset-invest", title: "Investments", body: "Stocks & shares ISA, LISA, crypto" },
    { cls: "bg-asset-pension", title: "Pensions", body: "Workplace pension, SIPP" },
    { cls: "bg-asset-property", title: "Property", body: "Your home's estimated value" },
    { cls: "bg-debt", title: "Debts", body: "Cards, loans, mortgage, student loan" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="card-hero holo-panel p-6 rise" style={rise(0)}>
        <div className="absolute inset-x-6 top-0 h-1 ledger-strip opacity-70" aria-hidden="true" />
        <p className="section-eyebrow">Net worth</p>
        <h2 className="mt-2 text-display-md text-ink text-balance">See your whole financial picture</h2>
        <p className="mt-2 text-[13px] text-ink-soft leading-snug text-pretty">
          Your budget tracks money moving each month. Add your balances here and we'll show what you're worth,
          how it's trending, and anything that needs attention — emergency fund, debt, savings rate and more.
        </p>
        <button type="button" className="btn-accent mt-5 w-full" onClick={onAdd}>
          Add your first account
        </button>
        <p className="mt-2 text-[11px] text-ink-muted text-center">
          Nothing connects to your bank. Update balances whenever you like — monthly works well.
        </p>
      </section>
      <section className="dashboard-band rise" style={rise(1)}>
        <h2 className="section-title mb-3">What to add</h2>
        <ul role="list" className="flex flex-col gap-3">
          {items.map((it) => (
            <li key={it.title} className="flex items-start gap-3">
              <span className={`mt-1.5 size-2.5 rounded-full shrink-0 ${it.cls}`} aria-hidden="true" />
              <div>
                <p className="text-[14px] font-semibold text-ink">{it.title}</p>
                <p className="text-[12px] text-ink-muted">{it.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
