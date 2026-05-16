import { useEffect } from "react";
import { useAppStore } from "./store.js";

function resolveTheme(pref: "light" | "dark" | "system"): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Keep the browser chrome (status bar / address bar tint) in step.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#10141c" : "#fafafa");
}

export function useTheme(): void {
  const pref = useAppStore((s) => s.ui.theme);
  useEffect(() => {
    apply(resolveTheme(pref));
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply(resolveTheme(pref));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref]);
}
