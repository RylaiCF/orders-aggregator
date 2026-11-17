# 03: Persist Paid Amount in Database Schema and Order Ingestion

**What to build:**
The database schema stores the net amount actually paid by customers (`amount_paid_kop`), and order synchronization and webhook ingestion pipelines parse and persist `amountPaid` and `discountPercent` from upstream orders. Legacy orders without discount information safely fallback to `amountPaid = amount`.

**Blocked by:** 02: Lossless Decimal-to-Kopeck Precision in Money Utilities

**Status:** closed

- [x] Migration `002_add_discounts.sql` adds `amount_paid_kop BIGINT NOT NULL` to `orders`, backfilling existing rows with `amount_kop`.
- [x] `ExternalOrder` validation accepts `amountPaid` and `discountPercent` (as numbers or numeric strings).
- [x] Incoming orders with `amountPaid` persist `amount_paid_kop` in kopecks.
- [x] Incoming legacy orders without `amountPaid` default to `amount_paid_kop = amount_kop`.
- [x] Safe fallback computes `amountPaid` from `discountPercent` if `amountPaid` is missing.
- [x] Webhook updates (`POST /webhooks/order`) update `amount_paid_kop` for newer order revisions and ignore stale revisions.
- [x] Batch synchronization (`POST /sync`) applies orders with paid amounts without errors.
- [x] Unit and integration tests for orders service, repository, sync, and webhooks pass.
