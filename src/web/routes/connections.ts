import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { ConnectionService } from "../../core/services/connection-service.js";
import { connectionSchema, newConnectionSchema, connectionUpdateSchema, connectionIdParam, errorResponseSchema } from "../schemas/connection.js";
import { ApiError } from "../errors.js";

const listRoute = createRoute({
  method: "get",
  path: "/api/connections",
  responses: {
    200: { description: "All saved connections", content: { "application/json": { schema: z.array(connectionSchema) } } },
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/connections",
  request: {
    body: { content: { "application/json": { schema: newConnectionSchema } } },
  },
  responses: {
    201: { description: "Connection created", content: { "application/json": { schema: connectionSchema } } },
    409: { description: "Already exists", content: { "application/json": { schema: errorResponseSchema } } },
  },
});

const updateRoute = createRoute({
  method: "put",
  path: "/api/connections/{id}",
  request: {
    params: connectionIdParam,
    body: { content: { "application/json": { schema: connectionUpdateSchema } } },
  },
  responses: {
    200: { description: "Connection updated", content: { "application/json": { schema: connectionSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorResponseSchema } } },
    409: { description: "Name/environment already in use", content: { "application/json": { schema: errorResponseSchema } } },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/connections/{id}",
  request: {
    params: connectionIdParam,
  },
  responses: {
    204: { description: "Connection deleted" },
    404: { description: "Not found", content: { "application/json": { schema: errorResponseSchema } } },
  },
});

// Thin route handlers: parse (Hono/zod already validated), delegate to
// ConnectionService, respond. All business logic lives in the service.
export function registerConnectionRoutes(app: OpenAPIHono, connectionService: ConnectionService): void {
  app.openapi(listRoute, async (c) => {
    const connections = await connectionService.list();
    return c.json(connections, 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid("json");
    try {
      const created = await connectionService.create(body);
      return c.json(created, 201);
    } catch (error) {
      throw new ApiError(409, "ALREADY_EXISTS", error instanceof Error ? error.message : String(error));
    }
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid("param");
    const updates = c.req.valid("json");
    try {
      const updated = await connectionService.update(id, updates);
      return c.json(updated, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("already exists") ? 409 : 404;
      throw new ApiError(status, status === 409 ? "ALREADY_EXISTS" : "NOT_FOUND", message);
    }
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    try {
      await connectionService.delete(id);
    } catch (error) {
      throw new ApiError(404, "NOT_FOUND", error instanceof Error ? error.message : String(error));
    }
    return c.body(null, 204);
  });
}
