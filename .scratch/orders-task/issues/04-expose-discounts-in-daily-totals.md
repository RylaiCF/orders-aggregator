# 04: Expose Discounts in Daily Totals API

**What to build:**
The customer daily statistics endpoint (`GET /customers/:id/daily-totals`) reports daily discount metrics alongside gross volume: `gross` (pre-discount amount), `net` (amount actually paid), `discount` (`gross - net`), and preserves `total` (equal to `gross`) for backward compatibility. Days with zero orders return `0` for all metrics.

**Blocked by:** 03: Persist Paid Amount in Database Schema and Order Ingestion

**Status:** ready-for-agent

- [ ] `GET /customers/:id/daily-totals` returns an array of `{ date, total, gross, discount, net }`.
- [ ] `total === gross` holds true for every day in the response.
- [ ] `discount === gross - net` holds true to the kopeck without floating-point artifacts.
- [ ] Days with no paid orders return `{ date, total: 0, gross: 0, discount: 0, net: 0 }`.
- [ ] Non-paid orders (`pending`, `refunded`) are excluded from all totals.
- [ ] Existing tests in `totals.test.ts` updated to expect the new response shape and pass.
- [ ] New integration tests verify discount calculations across multiple orders.
