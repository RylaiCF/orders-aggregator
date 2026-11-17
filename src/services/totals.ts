import type { OrdersRepository } from "../repositories/orders.js";
import { fromKop } from "../utils/money.js";
import { datesBetween, orderDay } from "../utils/time.js";
import type { CustomersService } from "./customers.js";

export interface DailyTotal {
  date: string;
  total: number;
  gross: number;
  discount: number;
  net: number;
}

const DAY = 86_400_000;

export class TotalsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Sum of customer's paid orders by day in their time zone, from..to inclusive.
   * Days without payments have zero totals.
   */
  async daily(customerId: string, from: string, to: string): Promise<DailyTotal[]> {
    const timezone = await this.customers.timezone(customerId);

    // Time zone offsets are within ±14h: query with a ±1 day margin
    const rows = await this.orders.paidCreatedBetween(
      customerId,
      new Date(Date.parse(`${from}T00:00:00Z`) - DAY),
      new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY),
    );

    const sums = new Map(datesBetween(from, to).map((d) => [d, { grossKop: 0, netKop: 0 }]));
    for (const o of rows) {
      const date = orderDay(o.createdAt, timezone);
      const cur = sums.get(date);
      if (cur !== undefined) {
        cur.grossKop += o.amountKop;
        cur.netKop += o.amountPaidKop;
      }
    }
    return [...sums].map(([date, { grossKop, netKop }]) => {
      const discountKop = grossKop - netKop;
      return {
        date,
        total: fromKop(grossKop),
        gross: fromKop(grossKop),
        discount: fromKop(discountKop),
        net: fromKop(netKop),
      };
    });
  }
}
