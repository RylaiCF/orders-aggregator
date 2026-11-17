# 05: End-to-End Environment Run, Result Artifact & Documentation

**What to build:**
Clean environment verification of the full assignment workflow: database reset, migrations, full sync, webhook execution, generation of the mandatory `result.json` deliverable for customer `c_7`, and comprehensive technical documentation in `SOLUTION.md`.

**Blocked by:** 04: Expose Discounts in Daily Totals API

**Status:** closed

- [x] Environment cleanly restarts with `docker compose down -v && docker compose up -d`.
- [x] Migrations run cleanly via `npm run migrate`.
- [x] `POST /sync` executes to completion across all pages.
- [x] Upstream webhooks run via `docker compose run --rm orders-api webhooks --target http://host.docker.internal:3000/webhooks/order` and complete with 200 responses.
- [x] `GET /customers/c_7/daily-totals?from=2026-03-27&to=2026-03-31` is queried and saved to `result.json` in the project root.
- [x] `SOLUTION.md` is authored, explaining all decisions, DST root cause, edge cases, and future improvements per `TASK.md`.
- [x] All test suites pass (`npm test`) and type checking passes (`npm run typecheck`).
