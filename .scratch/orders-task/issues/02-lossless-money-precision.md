# 02: Lossless Decimal-to-Kopeck Precision in Money Utilities

**What to build:**
Conversion of monetary amounts from external decimal rubles into internal integer kopecks is protected against binary floating-point representation loss (IEEE-754). Decimal amounts with cents/kopecks (e.g. `4723.9`) convert without dropping a kopeck, while fractional kopecks (e.g. `10.999`) continue to be truncated.

**Blocked by:** 01: Fix Per-Order Local Timezone Date Resolution (DST Bug)

**Status:** ready-for-agent

- [ ] `toKop` converts `4723.9` to exactly `472390` kopecks without precision loss.
- [ ] `toKop` converts `10.999` to `1099` kopecks, correctly discarding fractional kopecks.
- [ ] `fromKop` converts `472390` kopecks to `4723.9` rubles.
- [ ] Unit tests in `money.test.ts` pass and cover known floating-point edge cases.
