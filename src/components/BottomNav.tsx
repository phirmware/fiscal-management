import type { Screen } from "../app/store.js";
import { useAppStore } from "../app/store.js";

interface NavItem {
  id: Screen;
  label: string;
  Icon: (props: { className?: string }) => JSX.Element;
}

const STROKE = "stroke-current fill-none";

const HomeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      className={STROKE}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"
    />
  </svg>
);

const BudgetIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      className={STROKE}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 6h16M4 12h16M4 18h10"
    />
    <circle cx="6" cy="6" r="1.4" className="fill-current" />
    <circle cx="6" cy="12" r="1.4" className="fill-current" />
    <circle cx="6" cy="18" r="1.4" className="fill-current" />
  </svg>
);

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      className={STROKE}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 12h3l3-7 4 14 3-7h5"
    />
  </svg>
);

const InsightsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      className={STROKE}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 20V10M10 20V4M16 20v-7M22 20H2"
    />
  </svg>
);

const SettingsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="3" className={STROKE} strokeWidth={1.8} />
    <path
      className={STROKE}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
    />
  </svg>
);

const ITEMS: NavItem[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "budget", label: "Budget", Icon: BudgetIcon },
  { id: "transactions", label: "Activity", Icon: ActivityIcon },
  { id: "insights", label: "Insights", Icon: InsightsIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export function BottomNav() {
  const screen = useAppStore((s) => s.selectedScreen);
  const setSelectedScreen = useAppStore((s) => s.setSelectedScreen);

  return (
    <div
      className="fixed bottom-0 left-1/2 z-30 -translate-x-1/2 w-full max-w-phone
        thumb-rise pt-2 px-3 print:hidden"
    >
      <nav
        className="card-glass nav-dock px-2 py-2"
        style={{ boxShadow: "var(--shadow-pop)" }}
        aria-label="Primary"
      >
        <ul role="list" className="grid grid-cols-5">
          {ITEMS.map((item) => {
            const active = item.id === screen;
            return (
              <li key={item.id} className="flex">
                <button
                  type="button"
                  onClick={() => setSelectedScreen(item.id)}
                  className="tap w-full relative flex flex-col items-center justify-center gap-0.5
                    py-1.5 rounded-2xl transition"
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                >
                  {active && (
                    <span
                      className="absolute inset-x-2 top-1 h-px rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, rgb(var(--c-accent) / 0.78), transparent)",
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`flex items-center justify-center transition-all duration-300
                      ${
                        active
                          ? "px-3.5 py-1 rounded-full bg-accent/15 text-accent scale-105"
                          : "px-2 py-1 text-ink-muted scale-100"
                      }`}
                    style={
                      active
                        ? {
                            boxShadow: "inset 0 0 0 1px rgb(var(--c-accent) / 0.18)",
                            transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                          }
                        : undefined
                    }
                  >
                    <item.Icon className="w-6 h-6 shrink-0" />
                  </span>
                  <span
                    className={`text-[11px] font-medium ${active ? "text-ink" : "text-ink-muted"}`}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
