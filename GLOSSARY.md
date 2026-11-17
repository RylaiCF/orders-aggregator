# Orders Aggregator

Service that aggregates customer orders from an upstream e-commerce system and provides daily sales statistics in customer local timezones.

## Language

**Gross**:
The sum of paid orders before discounts.
_Avoid_: Full amount, original price, pre-discount total

**Net**:
The amount actually paid by customers after discounts.
_Avoid_: Paid amount, final price, real payment

**Discount**:
The difference between gross and net amounts (gross - net).
_Avoid_: Deduction, markdown, rebate

**Total**:
Legacy name for gross amount, preserved for backwards compatibility.
_Avoid_: Aggregate sum

**Order Day**:
Calendar date (YYYY-MM-DD) of an order evaluated in the customer's IANA timezone at the order creation moment (`createdAt`).
_Avoid_: UTC day, transaction date, report date

**Customer Timezone**:
The IANA timezone identifier of the customer used to evaluate order days with respect to seasonal daylight saving time (DST) transitions.
_Avoid_: Fixed offset, static timezone
