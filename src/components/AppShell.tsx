import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav.js";
import { MonthSwitcher } from "./MonthSwitcher.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col relative">
      {/*
        Header spans the full viewport so the blurred background extends edge-to-edge
        on wide screens; its content is the one that's centered + capped.
      */}
      <header
        className="app-chrome sticky top-0 z-10 w-full
          after:content-[''] after:absolute after:inset-x-0 after:bottom-0
          after:h-px after:bg-surface-border/60"
      >
        <div className="max-w-phone mx-auto px-4 pt-3 pb-3.5">
          <MonthSwitcher />
        </div>
      </header>
      <div className="w-full max-w-phone mx-auto flex-1 flex flex-col">
        <main className="flex-1 px-4 pt-6 pb-32 overflow-y-auto">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
