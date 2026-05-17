import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav.js";
import { MonthSwitcher } from "./MonthSwitcher.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center bg-surface">
      <div className="w-full max-w-phone flex-1 flex flex-col">
        <header
          className="sticky top-0 z-10 bg-surface/85 backdrop-blur-xl
            border-b border-surface-border/70"
        >
          <div className="px-4 pt-3 pb-3">
            <MonthSwitcher />
          </div>
        </header>
        <main className="flex-1 px-4 pt-5 pb-28 overflow-y-auto">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
