# Per-order Timezone Resolution

The service previously calculated customer timezone offset once for the entire date range using `new Date()`. This caused reporting discrepancies across Daylight Saving Time (DST) transitions (e.g. Europe/Berlin on March 29, 2026), misclassifying orders created between 22:00 and 23:00 UTC into the previous calendar day. We decided to resolve the calendar date for each order individually at its `createdAt` timestamp using `Intl.DateTimeFormat` in Node.js, rather than grouping inside PostgreSQL via `AT TIME ZONE`.

## Considered Options

- **SQL-level grouping via `created_at AT TIME ZONE timezone`**: Rejected because `paidCreatedBetween` repository contract and container interfaces must remain unchanged per project constraints, and SQL timezone tables in Docker/Postgres may require additional timezone configuration.
- **Dynamic in-memory per-order date resolution**: Selected because it respects DST shifts automatically, requires no SQL schema changes to date queries, and keeps the repository contract simple.
