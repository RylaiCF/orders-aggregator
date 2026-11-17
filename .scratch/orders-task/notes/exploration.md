# Exploration Notes: Discounts in Statistics & DST Fix

## 1. Architectural Boundaries & Constraints
- Workspace repo: `orders-task/orders-aggregator`
- Invariants:
  - Do NOT modify `createContainer(db, api)` signature or `OrdersApi` interface.
  - Internal money precision: BIGINT kopecks (`amount_kop`, `amount_paid_kop`). Rubles only at external HTTP boundaries.
  - Test seam: HTTP injection (`app.inject`) with real Postgres test DB and `FakeApi`.

## 2. Issue 01: Fix Per-Order Local Timezone Date Resolution (DST Bug)
- **Problem**:
  In `src/services/totals.ts`, `offset` is evaluated once via `const offset = tzOffsetMinutes(timezone, new Date())`.
  In March 2026, `Europe/Berlin` transitions from CET (UTC+1) to CEST (UTC+2) at 02:00 CET on March 29, 2026.
  Orders created at 22:30 UTC:
  - 2026-03-28 22:30 UTC -> 23:30 CET -> March 28.
  - 2026-03-29 22:30 UTC -> 00:30 CEST (+2h) -> March 30.
  When evaluated with static offset (or offset from current date/wrong day), March 29 22:30 UTC falls into March 29 instead of March 30.
- **Solution**:
  Per ADR 0001, dynamically resolve each order's local date (`Order Day`) at `createdAt` in the customer's IANA timezone.
  Add `orderDay(at: Date, timeZone: string): string` to `src/utils/time.ts`:
  ```ts
  export function orderDay(at: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  ```
  In `TotalsService.daily(customerId, from, to)`:
  Instead of `dateAtOffset(o.createdAt, offset)`, use `orderDay(o.createdAt, timezone)`.

## 3. Issue 02: Lossless Decimal-to-Kopeck Precision in Money Utilities
- **Problem**:
  In `src/utils/money.ts`:
  `toKop(rub)` uses `Math.floor(rub * 100)`.
  Due to IEEE-754 floating point representation: `4723.9 * 100 = 472389.99999999994`, so `Math.floor` truncates to `472389` (1 kopeck lost).
- **Solution**:
  Update `toKop` to:
  ```ts
  export function toKop(rub: number): number {
    return Math.floor(Math.round(rub * 1000) / 10);
  }
  ```
  This preserves the requirement that fractional kopecks (e.g. `10.999`) truncate to `1099` while eliminating precision loss on decimal numbers with up to 2 decimal places.

## 4. Issue 03: Persist Paid Amount in Database Schema and Order Ingestion
- **Database Migration**:
  `migrations/002_add_discounts.sql`:
  ```sql
  ALTER TABLE orders ADD COLUMN amount_paid_kop BIGINT NOT NULL DEFAULT 0;
  UPDATE orders SET amount_paid_kop = amount_kop;
  ```
- **Repository**:
  In `src/repositories/orders.ts`:
  - `Order` interface: add `amountPaidKop: number`.
  - `Row` interface: add `amount_paid_kop: string`.
  - `fromRow`: maps `amountPaidKop: Number(r.amount_paid_kop)`.
  - `save`: insert/update `amount_paid_kop`.
- **Validation & Ingestion**:
  In `src/services/orders.ts`:
  - Extend `ExternalOrder`:
    `amountPaid: z.union([z.number(), z.string()]).optional()`
    `discountPercent: z.union([z.number(), z.string()]).optional()`
  - Normalize:
    If `o.amountPaid !== undefined`: `amountPaidKop = toKop(parseRub(o.amountPaid))`
    Else if `o.discountPercent !== undefined`:
      `const pct = parseRub(o.discountPercent);`
      `amountPaidKop = toKop(parseRub(o.amount) * (100 - pct) / 100);`
    Else: `amountPaidKop = toKop(parseRub(o.amount))`

## 5. Issue 04: Expose Discounts in Daily Totals API
- **Response Type**:
  ```ts
  export interface DailyTotal {
    date: string;
    total: number;
    gross: number;
    discount: number;
    net: number;
  }
  ```
- **Calculation in `TotalsService.daily`**:
  Maintain kopeck accumulators per day:
  `{ grossKop: number, netKop: number }`
  Default for empty days: `{ date, total: 0, gross: 0, discount: 0, net: 0 }`.
  For each order:
  `entry.grossKop += o.amountKop;`
  `entry.netKop += o.amountPaidKop;`
  Convert output:
  `const discountKop = grossKop - netKop;`
  `return { date, total: fromKop(grossKop), gross: fromKop(grossKop), discount: fromKop(discountKop), net: fromKop(netKop) };`

## 6. Issue 05: End-to-End Environment Run, Result Artifact & Documentation
- Reset containers: `docker compose down -v && docker compose up -d`.
- Run migrations: `npm run migrate`.
- Run full sync: `POST /sync`.
- Run webhooks script: `docker compose run --rm orders-api webhooks --target http://host.docker.internal:3000/webhooks/order`.
- Query `GET /customers/c_7/daily-totals?from=2026-03-27&to=2026-03-31` and save formatted JSON to `result.json` in repo root.
- Author `SOLUTION.md` adhering to `TASK.md` requirements.
