# 01: Fix Per-Order Local Timezone Date Resolution (DST Bug)

**What to build:**
Orders endpoint reflects accurate calendar days in customer local timezones across seasonal daylight saving time (DST) shifts. Specifically for customer `c_7` in `Europe/Berlin`, late-evening orders (22:00–23:00 UTC) on March 29–31 attribute to the correct local calendar day matching payment provider statements.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Customer order days are resolved per-order using each order's `createdAt` timestamp in the customer's IANA timezone.
- [x] Orders created at 22:30 UTC on March 28, 2026 for `Europe/Berlin` bucket into 2026-03-28.
- [x] Orders created at 22:30 UTC on March 29, 2026 for `Europe/Berlin` bucket into 2026-03-30 following the +2h DST transition.
- [x] Querying `GET /customers/c_7/daily-totals?from=2026-03-27&to=2026-03-31` produces correct order grouping for each day.
- [x] Existing test suites pass and new DST-specific unit/integration tests pass.
