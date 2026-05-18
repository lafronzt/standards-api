import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { AppError } from "./domain/errors.js";
import type { StandardsRepository } from "./domain/repository.js";
import { registerRoutes } from "./http/routes.js";
import { StandardsService } from "./services/standards-service.js";

export async function buildApp(repository: StandardsRepository, logLevel = "info") {
  const app = Fastify({
    logger: {
      level: logLevel
    }
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

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: {
        code: "internal_server_error",
        message: "Unexpected server error"
      }
    });
  });

  return app;
}
