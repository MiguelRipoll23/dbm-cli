import type { Hono } from "hono";
import type { ConnectionService } from "../../core/services/connection-service.js";
import { newConnectionSchema, connectionUpdateSchema, connectionIdParam } from "../schemas/connection.js";
import { ApiError } from "../errors.js";

// Thin route handlers: validate with zod, delegate to ConnectionService,
// respond. All business logic lives in the service.
export function registerConnectionRoutes(app: Hono, connectionService: ConnectionService): void {
  app.get("/api/connections", async (c) => {
    const connections = await connectionService.list();
    return c.json(connections, 200);
  });

  app.post("/api/connections", async (c) => {
    const parsed = newConnectionSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    try {
      const created = await connectionService.create(parsed.data);
      return c.json(created, 201);
    } catch (error) {
      throw new ApiError(409, "ALREADY_EXISTS", error instanceof Error ? error.message : String(error));
    }
  });

  app.put("/api/connections/:id", async (c) => {
    const idParsed = connectionIdParam.safeParse({ id: c.req.param("id") });
    if (!idParsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", idParsed.error.message);
    }
    const bodyParsed = connectionUpdateSchema.safeParse(await c.req.json());
    if (!bodyParsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", bodyParsed.error.message);
    }
    try {
      const updated = await connectionService.update(idParsed.data.id, bodyParsed.data);
      return c.json(updated, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("already exists") ? 409 : 404;
      throw new ApiError(status, status === 409 ? "ALREADY_EXISTS" : "NOT_FOUND", message);
    }
  });

  app.delete("/api/connections/:id", async (c) => {
    const idParsed = connectionIdParam.safeParse({ id: c.req.param("id") });
    if (!idParsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", idParsed.error.message);
    }
    try {
      await connectionService.delete(idParsed.data.id);
    } catch (error) {
      throw new ApiError(404, "NOT_FOUND", error instanceof Error ? error.message : String(error));
    }
    return c.body(null, 204);
  });
}
