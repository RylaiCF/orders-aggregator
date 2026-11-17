import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });

  it("вебхук сохраняет amount_paid_kop при создании и обновляет при более новой версии", async () => {
    const o = apiOrder({ amount: 1000, amountPaid: 900, updatedAt: "2026-02-10T12:00:00Z" });
    const res1 = await postWebhook(ctx.app, o);
    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toEqual({ result: "created" });

    const { rows: r1 } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(r1[0].amount_paid_kop)).toBe(90000);

    // Новая версия с дополнительной скидкой
    const res2 = await postWebhook(ctx.app, {
      ...o,
      amountPaid: 750,
      updatedAt: "2026-02-11T12:00:00Z",
    });
    expect(res2.json()).toEqual({ result: "updated" });

    const { rows: r2 } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(r2[0].amount_paid_kop)).toBe(75000);

    // Устаревшая версия игнорируется и не перезаписывает amount_paid_kop
    const res3 = await postWebhook(ctx.app, {
      ...o,
      amountPaid: 950,
      updatedAt: "2026-02-09T12:00:00Z",
    });
    expect(res3.json()).toEqual({ result: "stale" });

    const { rows: r3 } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(r3[0].amount_paid_kop)).toBe(75000);
  });

  it("вебхук вычисляет amount_paid_kop из discountPercent", async () => {
    const o = apiOrder({ amount: 500, discountPercent: 20 });
    const res = await postWebhook(ctx.app, o);
    expect(res.statusCode).toBe(200);

    const { rows } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(rows[0].amount_paid_kop)).toBe(40000);
  });
});
