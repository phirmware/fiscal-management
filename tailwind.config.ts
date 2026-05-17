import type { Config } from "tailwindcss";

const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: withVar("--c-ink"),
          soft: withVar("--c-ink-soft"),
          muted: withVar("--c-ink-muted"),
          faint: withVar("--c-ink-faint"),
        },
        surface: {
          DEFAULT: withVar("--c-surface"),
          card: withVar("--c-surface-card"),
          sunken: withVar("--c-surface-sunken"),
          border: withVar("--c-surface-border"),
        },
        status: {
          ok: withVar("--c-status-ok"),
          okSoft: withVar("--c-status-ok-soft"),
          warn: withVar("--c-status-warn"),
          warnSoft: withVar("--c-status-warn-soft"),
          over: withVar("--c-status-over"),
          overSoft: withVar("--c-status-over-soft"),
          info: withVar("--c-status-info"),
          infoSoft: withVar("--c-status-info-soft"),
        },
        group: {
          needs: withVar("--c-group-needs"),
          wants: withVar("--c-group-wants"),
          savings: withVar("--c-group-savings"),
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        // Display / hero numbers
        "display-xl": ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "700" }],
        "display-lg": ["2rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md": ["1.5rem", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "700" }],
      },
      maxWidth: {
        phone: "30rem",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      spacing: {
        safe: "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
} satisfies Config;
