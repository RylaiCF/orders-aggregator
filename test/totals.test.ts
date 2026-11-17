import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("GET /customers/:id/daily-totals", () => {
  it("суммирует оплаченные заказы по дням в таймзоне клиента", async () => {
    // c_1 — Europe/Moscow (UTC+3): 20:30Z ещё 10-е, 21:30Z уже 11-е
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T20:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 250, createdAt: "2026-02-10T21:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: "99", createdAt: "2026-02-11T10:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-11");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { date: "2026-02-09", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-10", total: 1000, gross: 1000, discount: 0, net: 1000 },
      { date: "2026-02-11", total: 349, gross: 349, discount: 0, net: 349 },
    ]);
  });

  it("не учитывает pending и refunded", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 500, amountPaid: 400 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, amountPaid: 500, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 900, amountPaid: 600, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 500, gross: 500, discount: 100, net: 400 }]);
  });

  it("учитывает только заказы этого клиента", async () => {
    ctx.api.customers.set("c_2", "Asia/Novosibirsk");
    await postWebhook(ctx.app, apiOrder({ amount: 500, amountPaid: 450 }));
    await postWebhook(ctx.app, apiOrder({ amount: 800, amountPaid: 700, customerId: "c_2" }));
    const res = await dailyTotals(ctx.app, "c_2", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 800, gross: 800, discount: 100, net: 700 }]);
  });

  it("таймзона клиента берётся из API один раз", async () => {
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    ctx.api.customers.set("c_1", "UTC");
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    const { rows } = await ctx.db.query(`SELECT timezone FROM customers WHERE id = 'c_1'`);
    expect(rows[0].timezone).toBe("Europe/Moscow");
  });

  it("валидирует даты", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-30", "2026-03-01")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "2026-03-02", "2026-03-01")).statusCode).toBe(400);
  });

  it("неизвестный клиент — 404", async () => {
    const res = await dailyTotals(ctx.app, "nobody", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(404);
  });

  it("корректно группирует заказы при переходе на летнее время (DST) в Europe/Berlin", async () => {
    ctx.api.customers.set("c_7", "Europe/Berlin");
    // 2026-03-28 22:30:00Z -> Europe/Berlin UTC+1 (CET) -> 2026-03-28 23:30 local -> 2026-03-28
    await postWebhook(
      ctx.app,
      apiOrder({ customerId: "c_7", amount: 100, createdAt: "2026-03-28T22:30:00Z" }),
    );
    // 2026-03-29 00:30:00Z -> Europe/Berlin UTC+1 (CET) -> 2026-03-29 01:30 local -> 2026-03-29
    await postWebhook(
      ctx.app,
      apiOrder({ customerId: "c_7", amount: 200, createdAt: "2026-03-29T00:30:00Z" }),
    );
    // 2026-03-29 22:30:00Z -> Europe/Berlin UTC+2 (CEST) -> 2026-03-30 00:30 local -> 2026-03-30
    await postWebhook(
      ctx.app,
      apiOrder({ customerId: "c_7", amount: 300, createdAt: "2026-03-29T22:30:00Z" }),
    );
    // 2026-03-30 22:30:00Z -> Europe/Berlin UTC+2 (CEST) -> 2026-03-31 00:30 local -> 2026-03-31
    await postWebhook(
      ctx.app,
      apiOrder({ customerId: "c_7", amount: 400, createdAt: "2026-03-30T22:30:00Z" }),
    );

    const res = await dailyTotals(ctx.app, "c_7", "2026-03-27", "2026-03-31");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { date: "2026-03-27", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-03-28", total: 100, gross: 100, discount: 0, net: 100 },
      { date: "2026-03-29", total: 200, gross: 200, discount: 0, net: 200 },
      { date: "2026-03-30", total: 300, gross: 300, discount: 0, net: 300 },
      { date: "2026-03-31", total: 400, gross: 400, discount: 0, net: 400 },
    ]);
  });

  it("корректно рассчитывает скидки (gross, net, discount) для нескольких заказов", async () => {
    // 3 оплаченных заказа в один день с разными скидками:
    // 1) amount: 1000, amountPaid: 800 (скидка 200)
    // 2) amount: 500, discountPercent: 10 -> amountPaid: 450 (скидка 50)
    // 3) amount: 250 (без скидки -> amountPaid: 250, скидка 0)
    await postWebhook(
      ctx.app,
      apiOrder({ amount: 1000, amountPaid: 800, createdAt: "2026-02-10T10:00:00Z" }),
    );
    await postWebhook(
      ctx.app,
      apiOrder({ amount: 500, discountPercent: 10, createdAt: "2026-02-10T12:00:00Z" }),
    );
    await postWebhook(
      ctx.app,
      apiOrder({ amount: 250, createdAt: "2026-02-10T15:00:00Z" }),
    );

    // Заказ на следующий день с дробными суммами (проверка точности копеек без IEEE-754 артефактов)
    // amount: 4723.90, amountPaid: 4000.50 -> discount: 723.40
    await postWebhook(
      ctx.app,
      apiOrder({ amount: "4723.90", amountPaid: "4000.50", createdAt: "2026-02-11T09:00:00Z" }),
    );

    // Заказы pending/refunded со скидками не должны попадать в подсчет
    await postWebhook(
      ctx.app,
      apiOrder({ amount: 999, amountPaid: 100, status: "pending", createdAt: "2026-02-10T16:00:00Z" }),
    );
    await postWebhook(
      ctx.app,
      apiOrder({ amount: 888, amountPaid: 200, status: "refunded", createdAt: "2026-02-11T16:00:00Z" }),
    );

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-12");
    expect(res.statusCode).toBe(200);
    const data = res.json() as Array<{
      date: string;
      total: number;
      gross: number;
      discount: number;
      net: number;
    }>;

    expect(data).toEqual([
      { date: "2026-02-09", total: 0, gross: 0, discount: 0, net: 0 },
      { date: "2026-02-10", total: 1750, gross: 1750, discount: 250, net: 1500 },
      { date: "2026-02-11", total: 4723.9, gross: 4723.9, discount: 723.4, net: 4000.5 },
      { date: "2026-02-12", total: 0, gross: 0, discount: 0, net: 0 },
    ]);

    // Проверяем инварианты на каждом дне:
    for (const day of data) {
      expect(day.total).toBe(day.gross);
      // discount === gross - net с точностью до округления копеек
      expect(Math.round((day.gross - day.net) * 100)).toBe(Math.round(day.discount * 100));
    }
  });
});
