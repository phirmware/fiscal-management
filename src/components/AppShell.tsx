import type { ReactNode } from "react";
import { useAppStore } from "../app/store.js";
import { BottomNav } from "./BottomNav.js";
import { MonthSwitcher } from "./MonthSwitcher.js";

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" className="stroke-current fill-none" strokeWidth={1.8} />
      <path
        className="stroke-current fill-none"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const screen = useAppStore((s) => s.selectedScreen);
  const setSelectedScreen = useAppStore((s) => s.setSelectedScreen);
  const onSettings = screen === "settings";
  return (
    <div className="isolate min-h-full flex flex-col relative">
      {/*
        Header spans the full viewport so the blurred background extends edge-to-edge
        on wide screens; its content is the one that's centered + capped.
      */}
      <header
        className="app-chrome sticky top-0 z-10 w-full
          after:content-[''] after:absolute after:inset-x-0 after:bottom-0
          after:h-px after:bg-surface-border/60"
      >
        <div className="max-w-phone mx-auto px-4 pt-3 pb-3.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <MonthSwitcher />
          </div>
          <button
            type="button"
            onClick={() => setSelectedScreen(onSettings ? "home" : "settings")}
            className={`btn-icon !min-h-[52px] !min-w-[52px] rounded-[18px] border transition
              ${onSettings ? "bg-accent/15 text-accent border-accent/25" : "bg-surface-card/60 border-surface-border/70 text-ink-soft"}`}
            style={{ boxShadow: "var(--shadow-card)" }}
            aria-label={onSettings ? "Close settings" : "Settings"}
            aria-pressed={onSettings}
          >
            <SettingsIcon className="size-5 shrink-0" />
          </button>
        </div>
      </header>
      <div className="w-full max-w-phone mx-auto flex-1 flex flex-col">
        <main className="flex-1 px-4 pt-6 pb-32 overflow-y-auto">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
