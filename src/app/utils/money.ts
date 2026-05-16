const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatGBP(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return formatter.format(amount);
}

export function formatGBPCompact(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  if (Number.isInteger(amount)) return wholeFormatter.format(amount);
  return formatter.format(amount);
}

export function parseMoneyInput(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
