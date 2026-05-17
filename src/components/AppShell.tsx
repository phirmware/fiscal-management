import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav.js";
import { MonthSwitcher } from "./MonthSwitcher.js";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center">
      <div className="w-full max-w-phone flex-1 flex flex-col">
        <header
          className="sticky top-0 z-10 px-4 pt-3 pb-3
            bg-surface/70 backdrop-blur-xl
            [&::after]:content-[''] [&::after]:absolute [&::after]:inset-x-0 [&::after]:bottom-0
            [&::after]:h-px [&::after]:bg-surface-border/60"
        >
          <MonthSwitcher />
        </header>
        <main className="flex-1 px-4 pt-6 pb-32 overflow-y-auto">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
