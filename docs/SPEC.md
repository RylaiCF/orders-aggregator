# Specification: Discounts in Statistics & Daylight Saving Time Fix

## Problem Statement

Analytics and downstream consumers relying on the customer statistics endpoint (`GET /customers/:id/daily-totals`) face two significant problems:

1. **Lack of Discount Visibility**: The upstream orders system recently introduced discounts (`discountPercent` and `amountPaid`), but the statistics service continues to aggregate and expose only the gross order amount under `total`. Analytics teams cannot determine what customers actually paid (`net`) versus what discounts were granted (`discount`), leading to inaccurate revenue reporting.
2. **Daylight Saving Time Discrepancies**: Customer reports for late March (specifically March 27–31 for customer `c_7` in `Europe/Berlin`) diverge from payment provider figures. Because the service previously evaluated customer timezone offsets statically at runtime (`new Date()`) across the entire query range, orders placed late in the evening (between 22:00 and 23:00 UTC) across the seasonal transition (March 29) were attributed to the previous calendar day rather than the correct customer order day.

## Solution

1. **Discounts Integration**:
   - Ingest `amountPaid` and `discountPercent` from upstream batch synchronization and real-time order webhooks.
   - Persist the actual paid amount in integer kopecks alongside the gross amount.
   - Extend `GET /customers/:id/daily-totals` to return `gross`, `net`, `discount`, and preserve `total` (equal to `gross`) for backwards compatibility.
   - Ensure lossless decimal-to-kopeck conversion for upstream amounts with decimals.

2. **Per-Order Timezone Resolution**:
   - Resolve the calendar day (`Order Day`) for every order individually at its creation timestamp (`createdAt`) in the customer's IANA timezone.
   - Automatically account for seasonal Daylight Saving Time transitions, ensuring late-night orders properly bucket into the correct local calendar day before and after clock shifts.

## User Stories

1. As a business analyst, I want `GET /customers/:id/daily-totals` to return `gross` (pre-discount amount), so that I can see the total volume of goods ordered before promotional pricing.
2. As a financial analyst, I want `GET /customers/:id/daily-totals` to return `net` (actual amount paid), so that financial revenue matches our payment gateway receipts.
3. As a marketing manager, I want `GET /customers/:id/daily-totals` to return `discount` (`gross - net`), so that I can track the total monetary value of customer discounts granted each day.
4. As a legacy consumer of the API, I want `GET /customers/:id/daily-totals` to continue returning `total`, so that existing client integrations do not break when upgrading the service.
5. As an API client, I want `total` to be identical to `gross` on every day, so that backward compatibility maintains consistent semantics.
6. As a financial controller, I want monetary sums in daily statistics to be accurate to the kopeck without floating-point drift, so that accounting audits reconcile perfectly.
7. As an API client querying a day with no orders or payments, I want `total`, `gross`, `discount`, and `net` to return `0`, so that responses have consistent schemas and types across all dates.
8. As a customer service manager, I want orders placed by customers in timezones observing Daylight Saving Time (e.g. `Europe/Berlin`) to bucket into the calendar day of the customer's local time, so that customer-facing dashboards align with the customer's clock.
9. As an auditor reviewing late-night purchases across a DST switch (e.g. March 29 in Germany), I want purchases placed after the clock transition to be attributed to the new local day, so that daily totals match payment processor statements.
10. As a data engineer running batch synchronization (`POST /sync`), I want orders with discounts to have their `amountPaid` accurately recorded in the database, so that historical statistics reflect discounts.
11. As a data engineer running batch synchronization (`POST /sync`), I want legacy orders created prior to discount feature introduction (where `amountPaid` is missing) to default to `amountPaid = amount`, so that historical data remains complete and discount is recorded as 0.
12. As a backend developer processing `/webhooks/order` events, I want incoming webhook updates to update the stored paid amount when newer order versions arrive, so that order adjustments (e.g. discounts applied during checkout) are captured.
13. As a backend developer processing `/webhooks/order` events, I want stale webhook deliveries to be ignored without corrupting existing discount data, so that idempotent webhook retries remain safe.
14. As an integration tester, I want invalid order payloads missing required identifiers or with malformed amounts to fail validation gracefully during synchronization without terminating the entire batch sync run, so that transient corrupt records do not halt operations.
15. As a database administrator, I want schema migrations to apply cleanly to both fresh databases and existing deployments with pre-existing orders, so that zero-downtime upgrades proceed without manual intervention.

## Implementation Decisions

### 1. Database Schema & Persistence
- Add a new database migration (`002_add_discounts.sql`) that alters the `orders` table to include `amount_paid_kop BIGINT NOT NULL DEFAULT 0`.
- Backfill existing rows so that `amount_paid_kop = amount_kop`.
- Retain the project invariant: all monetary values are stored internally as integer kopecks (`BIGINT`).
- Store only `amount_paid_kop` alongside `amount_kop`; derive `discount_kop` on aggregation as `gross - net` (see ADR 0002).

### 2. Upstream Order Ingestion & Normalization
- Expand the external order schema validation to accept optional `amountPaid` and `discountPercent` fields (accepting either numeric values or numeric string representations).
- Normalization logic:
  - If `amountPaid` is present, parse and convert it to kopecks.
  - If `amountPaid` is missing but `discountPercent` is provided, calculate the paid amount using the discount percentage.
  - If neither discount field is present (orders created before discount rollout), set `amountPaid = amount`.

### 3. Precision & Float Handling
- Upstream orders can provide decimal ruble amounts (e.g., `4723.90`). Due to IEEE-754 binary floating-point representation, naïve `Math.floor(rub * 100)` loses 1 kopeck on fractional amounts.
- Adjust kopeck conversion to `Math.floor(Math.round(rub * 1000) / 10)` to eliminate float precision loss while preserving the contractual requirement of truncating fractional kopecks.

### 4. Per-Order Timezone Resolution & Aggregation
- Replace the static single-offset calculation (`tzOffsetMinutes(timezone, new Date())`) with per-order local calendar day evaluation based on each order's `createdAt` timestamp (see ADR 0001).
- Maintain the fetch window of `[from - 1 DAY, to + 2 DAYS]` to reliably capture all boundary orders regardless of timezone shift direction.
- In-memory date bucketing computes sums in integer kopecks (`grossKop`, `netKop`, `discountKop = grossKop - netKop`), and converts each to decimal rubles via `fromKop` upon serialization.

### 5. API Response Contract
- Extend the `DailyTotal` schema returned by `GET /customers/:id/daily-totals` to:
  ```ts
  interface DailyTotal {
    date: string;     // "YYYY-MM-DD"
    total: number;    // Legacy gross amount in rubles
    gross: number;    // Gross amount before discounts in rubles
    discount: number; // Total discounts in rubles (gross - net)
    net: number;      // Amount actually paid in rubles
  }
  ```
- Days with zero transactions return `{ date, total: 0, gross: 0, discount: 0, net: 0 }`.

## Testing Decisions

### What Makes a Good Test
Tests must observe only external HTTP behavior and invariants against the test database, without asserting internal repository implementation details or private methods.

### Test Seams
- **Primary Seam**: High-level Fastify HTTP injection (`app.inject`) with a real PostgreSQL test database and in-memory mock upstream API (`FakeApi`).
  - `GET /customers/:id/daily-totals?from=...&to=...`
  - `POST /webhooks/order`
  - `POST /sync`
- **Secondary Seam**: Pure utility functions for unit testing isolated arithmetic and calendar logic (`money.ts` and `time.ts`).

### Test Coverage Areas
1. **Discounts Aggregation**:
   - Multiple paid orders on the same day with varying discounts correctly aggregate into `gross`, `net`, and `discount`.
   - Verify `total === gross` and `discount === gross - net`.
   - Non-paid orders (`pending`, `refunded`) are excluded from all totals.
2. **Daylight Saving Time Transition**:
   - Orders placed on March 29, 2026 before and after 02:00 CET for customer `c_7` (`Europe/Berlin`) bucket into March 29 and March 30 accurately.
   - Orders placed at 22:30 UTC on March 28 (UTC+1 $\to$ 23:30 local) bucket into March 28.
   - Orders placed at 22:30 UTC on March 29 (UTC+2 $\to$ 00:30 local) bucket into March 30.
3. **Float Precision**:
   - Decimal amounts such as `4723.9` convert to `472390` kopecks without losing 1 kopeck.
   - Fractional kopecks (e.g. `10.999`) truncate to `1099` kopecks as expected.
4. **Synchronization & Webhooks**:
   - `POST /sync` accurately records `amount_paid_kop`.
   - `POST /webhooks/order` updates `amount_paid_kop` on newer order revisions and ignores stale revisions.

## Out of Scope

- Modifying the public signatures of `createContainer(db, api)` or the `OrdersApi` interface.
- Real-time currency conversions (all currency is treated as RUB / rubles).
- Partial refunds (orders are strictly in `pending`, `paid`, or `refunded` states).
- Modifying upstream API pagination mechanisms or rate limiters.

## Further Notes

- Deliverables require generating `result.json` representing `c_7` for `2026-03-27` through `2026-03-31` on a freshly synchronized database followed by webhook execution.
- Deliverables require a complete `SOLUTION.md` documenting decisions, root cause analysis, observations, and edge-case assumptions.
