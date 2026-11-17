import { describe, expect, it } from "vitest";
import { apiOrder, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /sync", () => {
  it("проходит все страницы и останавливается на пустой странице с тем же курсором", async () => {
    const [a, b, c] = [apiOrder(), apiOrder(), apiOrder()];
    ctx.api.pages.set(null, { items: [a, b], nextCursor: "p2" });
    ctx.api.pages.set("p2", { items: [c], nextCursor: "p3" });
    ctx.api.pages.set("p3", { items: [], nextCursor: "p3" });

    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pages: 3, received: 3, applied: 3, invalid: 0 });
    const { rows } = await ctx.db.query(`SELECT count(*)::int AS n FROM orders`);
    expect(rows[0].n).toBe(3);
  });

  it("невалидные заказы пропускает, а не падает", async () => {
    ctx.api.pages.set(null, { items: [apiOrder(), { id: "broken" }, apiOrder({ amount: "abc" })], nextCursor: null });
    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.json()).toMatchObject({ received: 3, applied: 1, invalid: 2 });
  });

  it("пропускает невалидные заказы с некорректными скидками или суммами как invalid", async () => {
    const valid = apiOrder({ amount: 1000, discountPercent: 10 });
    const badPctLow = apiOrder({ amount: 1000, discountPercent: -5 });
    const badPctHigh = apiOrder({ amount: 1000, discountPercent: 120 });
    const badPctStr = apiOrder({ amount: 1000, discountPercent: "bad" });
    const badPaidNeg = apiOrder({ amount: 1000, amountPaid: -10 });
    const badPaidExceed = apiOrder({ amount: 1000, amountPaid: 1500 });

    ctx.api.pages.set(null, {
      items: [valid, badPctLow, badPctHigh, badPctStr, badPaidNeg, badPaidExceed],
      nextCursor: null,
    });
    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: 6, applied: 1, invalid: 5 });
  });

  it("не откатывает более свежую версию заказа", async () => {
    const fresh = apiOrder({ status: "refunded", updatedAt: "2026-02-12T00:00:00Z" });
    await ctx.app.inject({ method: "POST", url: "/webhooks/order", payload: fresh });
    ctx.api.pages.set(null, { items: [{ ...fresh, status: "paid", updatedAt: "2026-02-10T12:00:00Z" }], nextCursor: null });

    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.json()).toMatchObject({ stale: 1 });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [fresh.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("строковые суммы и даты без зоны", async () => {
    const o = apiOrder({ amount: "2500.00", createdAt: "2026-02-10T21:30:00" });
    ctx.api.pages.set(null, { items: [o], nextCursor: null });
    await ctx.app.inject({ method: "POST", url: "/sync" });
    const { rows } = await ctx.db.query(`SELECT amount_kop, created_at FROM orders WHERE id = $1`, [o.id]);
    expect(Number(rows[0].amount_kop)).toBe(250000);
    expect(rows[0].created_at.toISOString()).toBe("2026-02-10T21:30:00.000Z");
  });

  it("синхронизирует заказы со скидками (amountPaid, discountPercent, legacy без скидок)", async () => {
    const o1 = apiOrder({ amount: 1000, amountPaid: 850 });
    const o2 = apiOrder({ amount: "2000.00", discountPercent: "15" });
    const o3 = apiOrder({ amount: 500 });
    const o4 = apiOrder({ amount: "4723.90", amountPaid: "4000.00" });
    const o5 = apiOrder({ amount: 100, amountPaid: 0 });
    const o6 = apiOrder({ amount: 1000, amountPaid: 800, discountPercent: 10 });

    ctx.api.pages.set(null, { items: [o1, o2, o3, o4, o5, o6], nextCursor: null });
    const res = await ctx.app.inject({ method: "POST", url: "/sync" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: 6, applied: 6, invalid: 0 });

    const { rows } = await ctx.db.query<{ id: string; amount_kop: string; amount_paid_kop: string }>(
      `SELECT id, amount_kop, amount_paid_kop FROM orders ORDER BY id`,
    );
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(Number(byId.get(o1.id)!.amount_kop)).toBe(100000);
    expect(Number(byId.get(o1.id)!.amount_paid_kop)).toBe(85000);

    expect(Number(byId.get(o2.id)!.amount_kop)).toBe(200000);
    expect(Number(byId.get(o2.id)!.amount_paid_kop)).toBe(170000);

    expect(Number(byId.get(o3.id)!.amount_kop)).toBe(50000);
    expect(Number(byId.get(o3.id)!.amount_paid_kop)).toBe(50000);

    expect(Number(byId.get(o4.id)!.amount_kop)).toBe(472390);
    expect(Number(byId.get(o4.id)!.amount_paid_kop)).toBe(400000);

    expect(Number(byId.get(o5.id)!.amount_kop)).toBe(10000);
    expect(Number(byId.get(o5.id)!.amount_paid_kop)).toBe(0);

    expect(Number(byId.get(o6.id)!.amount_kop)).toBe(100000);
    expect(Number(byId.get(o6.id)!.amount_paid_kop)).toBe(80000);
  });
});
