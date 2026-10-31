export function compact(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${+(n / 1e3).toFixed(digits)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export const usd = (n: number | null | undefined) => (n == null ? "—" : `$${compact(n)}`);

export const pct = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function quarterLabel(iso: string) {
  const d = new Date(iso);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
