import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("creates an order", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("duplicate event does not change anything", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("obsolete event after newer one is ignored", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("newer event updates the order", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("invalid body returns 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });

  it("webhook saves amount_paid_kop on creation and updates on newer version", async () => {
    const o = apiOrder({ amount: 1000, amountPaid: 900, updatedAt: "2026-02-10T12:00:00Z" });
    const res1 = await postWebhook(ctx.app, o);
    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toEqual({ result: "created" });

    const { rows: r1 } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(r1[0].amount_paid_kop)).toBe(90000);

    // Newer version with additional discount
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

    // Obsolete version is ignored and does not overwrite amount_paid_kop
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

  it("webhook calculates amount_paid_kop from discountPercent", async () => {
    const o = apiOrder({ amount: 500, discountPercent: 20 });
    const res = await postWebhook(ctx.app, o);
    expect(res.statusCode).toBe(200);

    const { rows } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(rows[0].amount_paid_kop)).toBe(40000);
  });

  it("webhook accepts string amount and amountPaid", async () => {
    const o = apiOrder({ amount: "1000.00", amountPaid: "850.50" });
    const res = await postWebhook(ctx.app, o);
    expect(res.statusCode).toBe(200);

    const { rows } = await ctx.db.query<{ amount_kop: string; amount_paid_kop: string }>(
      `SELECT amount_kop, amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(rows[0].amount_kop)).toBe(100000);
    expect(Number(rows[0].amount_paid_kop)).toBe(85050);
  });

  it("amountPaid takes precedence over discountPercent in webhook", async () => {
    const o = apiOrder({ amount: 1000, amountPaid: 900, discountPercent: 20 });
    const res = await postWebhook(ctx.app, o);
    expect(res.statusCode).toBe(200);

    const { rows } = await ctx.db.query<{ amount_paid_kop: string }>(
      `SELECT amount_paid_kop FROM orders WHERE id = $1`,
      [o.id],
    );
    expect(Number(rows[0].amount_paid_kop)).toBe(90000);
  });

  it("handles discount edge cases (0%, 100%, 0 rubles, strings with spaces, rounding)", async () => {
    const zeroDisc = apiOrder({ amount: 1000, discountPercent: 0 });
    await postWebhook(ctx.app, zeroDisc);

    const fullDisc = apiOrder({ amount: 1000, discountPercent: 100 });
    await postWebhook(ctx.app, fullDisc);

    const zeroPaid = apiOrder({ amount: 1000, amountPaid: 0 });
    await postWebhook(ctx.app, zeroPaid);

    const strWithSpaces = apiOrder({ amount: 1000, amountPaid: " 500.50 " });
    await postWebhook(ctx.app, strWithSpaces);

    const floatCalc = apiOrder({ amount: "4723.90", discountPercent: 10 });
    await postWebhook(ctx.app, floatCalc);

    const { rows } = await ctx.db.query<{ id: string; amount_paid_kop: string }>(
      `SELECT id, amount_paid_kop FROM orders WHERE id = ANY($1)`,
      [[zeroDisc.id, fullDisc.id, zeroPaid.id, strWithSpaces.id, floatCalc.id]],
    );
    const byId = new Map(rows.map((r) => [r.id, Number(r.amount_paid_kop)]));

    expect(byId.get(zeroDisc.id)).toBe(100000);
    expect(byId.get(fullDisc.id)).toBe(0);
    expect(byId.get(zeroPaid.id)).toBe(0);
    expect(byId.get(strWithSpaces.id)).toBe(50050);
    expect(byId.get(floatCalc.id)).toBe(425151);
  });

  it("rejects orders with invalid amountPaid or discountPercent with status 400", async () => {
    const cases = [
      { amountPaid: "invalid" },
      { amountPaid: -10 },
      { amountPaid: 1500, amount: 1000 },
      { discountPercent: "bad" },
      { discountPercent: -5 },
      { discountPercent: 105 },
      { discountPercent: "" },
      { discountPercent: "   " },
    ];
    for (const c of cases) {
      const res = await postWebhook(ctx.app, apiOrder(c));
      expect(res.statusCode).toBe(400);
    }
  });
});
