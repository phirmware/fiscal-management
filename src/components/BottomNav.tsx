import type { Screen } from "../app/store.js";
import { useAppStore } from "../app/store.js";

const ITEMS: { id: Screen; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "●" },
  { id: "budget", label: "Budget", icon: "◧" },
  { id: "transactions", label: "Activity", icon: "↕" },
  { id: "insights", label: "Insights", icon: "▲" },
  { id: "settings", label: "Settings", icon: "✱" },
];

export function BottomNav() {
  const screen = useAppStore((s) => s.selectedScreen);
  const setSelectedScreen = useAppStore((s) => s.setSelectedScreen);

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-phone bg-surface-card/95
        backdrop-blur border-t border-surface-border pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.id === screen;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedScreen(item.id)}
                className={`tap w-full flex flex-col items-center justify-center py-2.5 gap-0.5
                  text-xs ${active ? "text-ink font-semibold" : "text-ink-muted"}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`text-lg ${active ? "" : "opacity-70"}`}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
