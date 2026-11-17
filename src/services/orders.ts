import { z } from "zod";
import { ValidationError } from "../errors.js";
import type { Order, OrdersRepository } from "../repositories/orders.js";
import { parseRub, toKop } from "../utils/money.js";
import { parseUtc } from "../utils/time.js";

/** Заказ в формате внешнего API (поля, которые нам нужны; остальные игнорируем). */
const ExternalOrder = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  amountPaid: z.union([z.number(), z.string()]).nullish(),
  discountPercent: z.union([z.number(), z.string()]).nullish(),
  status: z.enum(["pending", "paid", "refunded"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplyResult = "created" | "updated" | "stale";

function parseDiscountPercent(raw: unknown): number {
  if (typeof raw === "string" && raw.trim() === "") {
    throw new ValidationError(`invalid discountPercent: ${JSON.stringify(raw)}`);
  }
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ValidationError(`invalid discountPercent: ${JSON.stringify(raw)}`);
  }
  return value;
}

export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  normalize(raw: unknown): Order {
    const parsed = ExternalOrder.safeParse(raw);
    if (!parsed.success) throw new ValidationError(`invalid order: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    const o = parsed.data;
    try {
      const amountRub = parseRub(o.amount);
      const amountKop = toKop(amountRub);
      let amountPaidKop: number;
      if (o.amountPaid !== undefined && o.amountPaid !== null) {
        amountPaidKop = toKop(parseRub(o.amountPaid));
      } else if (o.discountPercent !== undefined && o.discountPercent !== null) {
        const pct = parseDiscountPercent(o.discountPercent);
        amountPaidKop = toKop((amountRub * (100 - pct)) / 100);
      } else {
        amountPaidKop = amountKop;
      }

      if (amountPaidKop < 0 || amountPaidKop > amountKop) {
        throw new ValidationError(`amountPaidKop must be between 0 and amountKop (got ${amountPaidKop}, max ${amountKop})`);
      }

      return {
        id: o.id,
        customerId: o.customerId,
        amountKop,
        amountPaidKop,
        status: o.status,
        createdAt: parseUtc(o.createdAt),
        updatedAt: parseUtc(o.updatedAt),
      };
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      throw new ValidationError((e as Error).message);
    }
  }

  /**
   * Применяет версию заказа (из синка или вебхука).
   * Вебхуки приходят с повторами и не по порядку, поэтому версию сохраняем,
   * только если она новее уже сохранённой (по updatedAt).
   */
  async apply(raw: unknown): Promise<ApplyResult> {
    const incoming = this.normalize(raw);
    const current = await this.orders.get(incoming.id);
    if (current && current.updatedAt.getTime() >= incoming.updatedAt.getTime()) return "stale";
    await this.orders.save(incoming);
    return current ? "updated" : "created";
  }
}
