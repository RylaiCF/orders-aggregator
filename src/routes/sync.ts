import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

export function syncRoutes(app: FastifyInstance, c: Container) {
  // Synchronous: responds when all pages have been fetched
  app.post("/sync", async () => c.sync.run());
}
