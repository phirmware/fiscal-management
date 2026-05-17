import { useEffect } from "react";
import { useAppStore } from "./store.js";
import type { ThemePreference } from "./state.js";

type AppliedTheme = "light" | "dark" | "liquid";

function resolveTheme(pref: ThemePreference): AppliedTheme {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function metaColourFor(theme: AppliedTheme): string {
  switch (theme) {
    case "light":
      return "#faf9f7";
    case "dark":
      return "#090a12";
    case "liquid":
      return "#04060f";
  }
}

function apply(theme: AppliedTheme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", metaColourFor(theme));
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
