import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

export function webhookRoutes(app: FastifyInstance, c: Container) {
  // Duplicate or obsolete version — 200 without changes, otherwise the sender will retry
  app.post("/webhooks/order", async (req) => ({ result: await c.orders.apply(req.body) }));
}
