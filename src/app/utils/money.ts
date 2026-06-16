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

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  const rounded =
    Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function formatGBP(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return formatter.format(roundMoney(amount));
}

export function formatGBPCompact(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const rounded = roundMoney(amount);
  if (Number.isInteger(rounded)) return wholeFormatter.format(rounded);
  return formatter.format(rounded);
}

export function parseMoneyInput(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return roundMoney(n);
}
