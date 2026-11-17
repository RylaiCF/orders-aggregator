/**
 * Money inside the service is stored as integer kopecks. Rubles are only used at the boundary (external API) and in responses.
 */

/** Amount from external API: number or numeric string ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Rubles → kopecks. Fractional kopecks are truncated: never overcredit the customer. */
export function toKop(rub: number): number {
  return Math.floor(Math.round(rub * 1000) / 10);
}

/** Kopecks → rubles for API response. */
export function fromKop(kop: number): number {
  return kop / 100;
}
