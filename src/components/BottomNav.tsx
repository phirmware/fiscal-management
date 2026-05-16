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
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-phone
        bg-surface-card/95 backdrop-blur-md border-t border-surface-border
        pb-[env(safe-area-inset-bottom)] print:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5 px-2 pt-2">
        {ITEMS.map((item) => {
          const active = item.id === screen;
          return (
            <li key={item.id} className="flex">
              <button
                type="button"
                onClick={() => setSelectedScreen(item.id)}
                className="tap w-full flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl
                  transition-colors text-ink-muted hover:text-ink-soft"
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
              >
                <span
                  className={`flex items-center justify-center rounded-full transition-all
                    ${active ? "bg-ink text-surface px-4 py-1" : "px-2 py-1"}`}
                >
                  <item.Icon className="w-[22px] h-[22px]" />
                </span>
                <span
                  className={`text-[11px] leading-tight transition-colors
                    ${active ? "text-ink font-semibold" : ""}`}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
