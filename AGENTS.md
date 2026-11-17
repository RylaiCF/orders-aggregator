# AGENTS.md

Instructions, architectural invariants, and context pointers for AI agents working on `orders-aggregator`.

## Domain & Invariants

Always respect the canonical domain language defined in [GLOSSARY.md](GLOSSARY.md).

- **Money**: All monetary values inside the service and PostgreSQL database are strictly stored as integer kopecks (`BIGINT`, e.g. `amount_kop`, `amount_paid_kop`). Rubles exist only at upstream API boundary and HTTP response boundary. Never introduce floating-point math for money storage.
- **Timezones**: Customer order days must be evaluated in the customer's IANA timezone individually for each order at its `createdAt` timestamp. Never evaluate timezone offsets globally or statically across a date range.
- **Contract Compatibility**: The signature of `createContainer(db, api)` and the interface `OrdersApi` must remain unmodified.

## Architectural Decision Records (ADRs)

Consult the project ADRs before modifying data models or aggregation logic:

- [ADR 0001: Per-order Timezone Resolution](docs/adr/0001-per-order-timezone-resolution.md) — Why customer order dates are resolved individually in Node.js rather than through SQL-level grouping across seasonal daylight saving time (DST) shifts.
- [ADR 0002: Store Paid Amount in Kopecks](docs/adr/0002-store-paid-amount-in-kopecks.md) — Why only `amount_paid_kop` is persisted, while `discount` is computed on the fly as `gross - net`.

## Specification & Active Feature

- [docs/SPEC.md](docs/SPEC.md) — Comprehensive functional specification covering discounts in statistics (`gross`, `net`, `discount`, `total`) and the Daylight Saving Time fix for customer `c_7`.

## Testing & Verification Seams

- **Primary Seam**: High-level Fastify injection (`ctx.app.inject`) in `test/*.test.ts` backed by a real PostgreSQL test database (`orders_test`) and `FakeApi`. Do not mock repository methods or service internals; assert against external HTTP behavior and invariants.
- **Commands**:
  - `npm test` — Run all test suites with Vitest.
  - `npm run typecheck` — TypeScript verification (`tsc --noEmit`).
  - `npm run migrate` — Apply database migrations.
