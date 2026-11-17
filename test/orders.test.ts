import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/errors.js";
import { apiOrder, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("OrdersService.normalize", () => {
  it("нормализует заказ с amountPaid (число)", () => {
    const raw = apiOrder({ amount: 1000, amountPaid: 850 });
    const order = ctx.container.orders.normalize(raw);
    expect(order.amountKop).toBe(100000);
    expect(order.amountPaidKop).toBe(85000);
  });

  it("нормализует заказ с amountPaid (строка)", () => {
    const raw = apiOrder({ amount: "1000.00", amountPaid: "850.50" });
    const order = ctx.container.orders.normalize(raw);
    expect(order.amountKop).toBe(100000);
    expect(order.amountPaidKop).toBe(85050);
  });

  it("нормализует заказ с discountPercent (число)", () => {
    const raw = apiOrder({ amount: 1000, discountPercent: 15 });
    const order = ctx.container.orders.normalize(raw);
    expect(order.amountKop).toBe(100000);
    expect(order.amountPaidKop).toBe(85000);
  });

  it("нормализует заказ с discountPercent (строка)", () => {
    const raw = apiOrder({ amount: "2000.00", discountPercent: "15" });
    const order = ctx.container.orders.normalize(raw);
    expect(order.amountKop).toBe(200000);
    expect(order.amountPaidKop).toBe(170000);
  });

  it("amountPaid имеет приоритет над discountPercent", () => {
    const raw = apiOrder({ amount: 1000, amountPaid: 900, discountPercent: 20 });
    const order = ctx.container.orders.normalize(raw);
    expect(order.amountPaidKop).toBe(90000);
  });

  it("legacy заказ без скидок получает amountPaidKop = amountKop", () => {
    const raw = apiOrder({ amount: 1500 });
    const order = ctx.container.orders.normalize(raw);
    expect(order.amountKop).toBe(150000);
    expect(order.amountPaidKop).toBe(150000);
  });

  it("обрабатывает граничные значения скидок (0%, 100%, 0 рублей)", () => {
    const zeroDisc = ctx.container.orders.normalize(apiOrder({ amount: 1000, discountPercent: 0 }));
    expect(zeroDisc.amountPaidKop).toBe(100000);

    const fullDisc = ctx.container.orders.normalize(apiOrder({ amount: 1000, discountPercent: 100 }));
    expect(fullDisc.amountPaidKop).toBe(0);

    const zeroPaid = ctx.container.orders.normalize(apiOrder({ amount: 1000, amountPaid: 0 }));
    expect(zeroPaid.amountPaidKop).toBe(0);

    const strWithSpaces = ctx.container.orders.normalize(apiOrder({ amount: 1000, amountPaid: " 500.50 " }));
    expect(strWithSpaces.amountPaidKop).toBe(50050);

    const floatCalc = ctx.container.orders.normalize(apiOrder({ amount: "4723.90", discountPercent: 10 }));
    expect(floatCalc.amountPaidKop).toBe(425151);
  });

  it("выбрасывает ValidationError при невалидном amountPaid или discountPercent", () => {
    expect(() => ctx.container.orders.normalize(apiOrder({ amountPaid: "invalid" }))).toThrow(ValidationError);
    expect(() => ctx.container.orders.normalize(apiOrder({ discountPercent: "bad" }))).toThrow(ValidationError);
    expect(() => ctx.container.orders.normalize(apiOrder({ amountPaid: -10 }))).toThrow(ValidationError);
  });
});

describe("OrdersRepository", () => {
  it("сохраняет и возвращает order с amountPaidKop через get() и paidCreatedBetween()", async () => {
    const order = ctx.container.orders.normalize(
      apiOrder({
        id: "o_repo_1",
        customerId: "c_1",
        amount: 1000,
        amountPaid: 800,
        status: "paid",
        createdAt: "2026-02-10T12:00:00.000Z",
      }),
    );

    await ctx.container.orders["orders"].save(order);

    const fetched = await ctx.container.orders["orders"].get("o_repo_1");
    expect(fetched).not.toBeNull();
    expect(fetched?.amountKop).toBe(100000);
    expect(fetched?.amountPaidKop).toBe(80000);

    const between = await ctx.container.orders["orders"].paidCreatedBetween(
      "c_1",
      new Date("2026-02-10T00:00:00.000Z"),
      new Date("2026-02-11T00:00:00.000Z"),
    );
    expect(between).toHaveLength(1);
    expect(between[0].amountPaidKop).toBe(80000);
  });
});
