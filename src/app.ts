import fastifyRateLimit, { type errorResponseBuilderContext } from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { randomUUID } from "crypto";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import { AppError } from "./domain/errors.js";
import type { StandardsRepository } from "./domain/repository.js";
import { registerRoutes } from "./http/routes.js";
import { StandardsService } from "./services/standards-service.js";

export async function buildApp(repository: StandardsRepository, logLevel = "info") {
  const app = Fastify({
    logger: {
      level: logLevel
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID()
  });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request: FastifyRequest, context: errorResponseBuilderContext) => ({
      error: {
        code: "rate_limit_exceeded",
        message: "Too many requests",
        details: {
          limit: context.max,
          after: context.after
        }
      }
    })
  });

  await app.register(sensible);
  await registerRoutes(app, new StandardsService(repository));

  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({
      error: {
        code: "not_found",
        message: "Route not found"
      }
    })
  );

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: request.id
        }
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: {
        code: "internal_server_error",
        message: "Unexpected server error",
        request_id: request.id
      }
    });
  });

  return app;
}
