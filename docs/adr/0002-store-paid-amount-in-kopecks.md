# Store Paid Amount in Kopecks

The upstream API introduced discount information with `amountPaid` and `discountPercent`. We decided to add a single column `amount_paid_kop BIGINT NOT NULL` via migration `002_add_discounts.sql`, defaulting older orders to `amount_paid_kop = amount_kop`. The API output `discount` is computed dynamically as `gross - net`.

## Considered Options

- **Store `amount_paid_kop`, `discount_percent`, and `discount_kop`**: Rejected because storing derived values creates redundancy and potential inconsistencies if upstream discount calculations round differently.
- **Store only `amount_paid_kop`**: Selected because `amount_kop` and `amount_paid_kop` represent the primary financial invariants in integer kopecks. `discount = gross - net` is always exact and guaranteed to sum cleanly without rounding drift.
