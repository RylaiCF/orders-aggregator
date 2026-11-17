# 03: Persist Paid Amount in Database Schema and Order Ingestion

**What to build:**
The database schema stores the net amount actually paid by customers (`amount_paid_kop`), and order synchronization and webhook ingestion pipelines parse and persist `amountPaid` and `discountPercent` from upstream orders. Legacy orders without discount information safely fallback to `amountPaid = amount`.

**Blocked by:** 02: Lossless Decimal-to-Kopeck Precision in Money Utilities

**Status:** ready-for-agent

- [ ] Migration `002_add_discounts.sql` adds `amount_paid_kop BIGINT NOT NULL` to `orders`, backfilling existing rows with `amount_kop`.
- [ ] `ExternalOrder` validation accepts `amountPaid` and `discountPercent` (as numbers or numeric strings).
- [ ] Incoming orders with `amountPaid` persist `amount_paid_kop` in kopecks.
- [ ] Incoming legacy orders without `amountPaid` default to `amount_paid_kop = amount_kop`.
- [ ] Safe fallback computes `amountPaid` from `discountPercent` if `amountPaid` is missing.
- [ ] Webhook updates (`POST /webhooks/order`) update `amount_paid_kop` for newer order revisions and ignore stale revisions.
- [ ] Batch synchronization (`POST /sync`) applies orders with paid amounts without errors.
- [ ] Unit and integration tests for orders service, repository, sync, and webhooks pass.
