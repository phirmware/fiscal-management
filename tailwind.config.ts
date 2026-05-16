import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0f1115",
          soft: "#3a3f48",
          muted: "#6a7079",
          faint: "#9ca3ad",
        },
        surface: {
          DEFAULT: "#fafafa",
          card: "#ffffff",
          sunken: "#f0f1f3",
          border: "#e4e6ea",
        },
        status: {
          ok: "#16a34a",
          okSoft: "#dcfce7",
          warn: "#d97706",
          warnSoft: "#fef3c7",
          over: "#dc2626",
          overSoft: "#fee2e2",
          info: "#2563eb",
          infoSoft: "#dbeafe",
        },
        group: {
          needs: "#0284c7",
          wants: "#9333ea",
          savings: "#059669",
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
      maxWidth: {
        phone: "30rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
