import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { UnauthorizedError } from "../domain/errors.js";
import type { StandardInput } from "../domain/standard.js";
import type { StandardsService } from "../services/standards-service.js";
import { parseWithSchema } from "../validation/parse.js";
import {
  applicableQuerySchema,
  listStandardsQuerySchema,
  standardBodySchema,
  updateStandardBodySchema
} from "../validation/standards.js";
import { serializeReviewOpsPayload, serializeStandard } from "./serializers.js";

type StandardBody = z.output<typeof standardBodySchema>;
type UpdateStandardBody = z.output<typeof updateStandardBodySchema>;

export async function registerRoutes(app: FastifyInstance, service: StandardsService): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    service: "standards-api",
    timestamp: new Date().toISOString()
  }));

  app.get("/api/v1/standards", async (request) => {
    const query = parseWithSchema(listStandardsQuerySchema, request.query);
    const rules = await service.list(query);
    return { data: rules.map(serializeStandard) };
  });

  app.get("/api/v1/standards/latest", async () => serializeReviewOpsPayload(await service.latestPayload()));

  app.get("/api/v1/standards/applicable", async (request) => {
    const query = parseWithSchema(applicableQuerySchema, request.query);
    return serializeReviewOpsPayload(
      await service.applicable({
        repo: query.repo,
        team: query.team,
        language: query.language,
        framework: query.framework,
        runtime: query.runtime,
        environment: query.environment,
        changedPaths: query.changed_paths
      })
    );
  });

  app.get("/api/v1/standards/:ruleKey", async (request) => {
    const { ruleKey } = request.params as { ruleKey: string };
    return serializeStandard(await service.getLatest(ruleKey));
  });

  app.post("/api/v1/standards", async (request, reply) => {
    requireWriteApiKey(request.headers["x-api-key"]);
    const body = parseWithSchema(standardBodySchema, request.body);
    const rule = await service.create(toInput(body));
    return reply.code(201).send(serializeStandard(rule));
  });

  app.put("/api/v1/standards/:ruleKey", async (request, reply) => {
    requireWriteApiKey(request.headers["x-api-key"]);
    const { ruleKey } = request.params as { ruleKey: string };
    const body = parseWithSchema(updateStandardBodySchema, request.body);
    const rule = await service.updateRule(ruleKey, toPartialInput(body));
    return reply.code(201).send(serializeStandard(rule));
  });

  app.get("/openapi.json", async () => openApiDocument);

  app.get("/docs", async (_request, reply) =>
    reply.type("text/html").send(`<!doctype html>
<html lang="en">
  <head><title>Standards API Docs</title></head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`)
  );
}

function requireWriteApiKey(headerValue: string | string[] | undefined): void {
  const expected = process.env.STANDARDS_API_KEY;
  const mustRequireKey = process.env.NODE_ENV === "production" || Boolean(expected);
  if (!mustRequireKey) {
    return;
  }

  const actual = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!expected || actual !== expected) {
    throw new UnauthorizedError("Missing or invalid API key");
  }
}

function toInput(body: StandardBody): StandardInput {
  return {
    ruleKey: body.rule_key,
    title: body.title,
    description: body.description,
    status: body.status,
    severity: body.severity,
    category: body.category,
    appliesTo: body.applies_to,
    ruleText: body.rule_text,
    reviewGuidance: body.review_guidance,
    goodExample: body.good_example,
    badExample: body.bad_example,
    rationale: body.rationale,
    tags: body.tags,
    sourceUrl: body.source_url,
    createdBy: body.created_by,
    updatedBy: body.updated_by,
    approvedBy: body.approved_by,
    owner: body.owner,
    version: body.version,
    deprecatedAt: body.deprecated_at
  };
}

function toPartialInput(body: UpdateStandardBody): Partial<StandardInput> {
  return {
    title: body.title,
    description: body.description,
    status: body.status,
    severity: body.severity,
    category: body.category,
    appliesTo: body.applies_to,
    ruleText: body.rule_text,
    reviewGuidance: body.review_guidance,
    goodExample: body.good_example,
    badExample: body.bad_example,
    rationale: body.rationale,
    tags: body.tags,
    sourceUrl: body.source_url,
    createdBy: body.created_by,
    updatedBy: body.updated_by,
    approvedBy: body.approved_by,
    owner: body.owner,
    version: body.version,
    deprecatedAt: body.deprecated_at
  };
}

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Standards API",
    version: "1.0.0"
  },
  paths: {
    "/health": { get: { responses: { "200": { description: "Service health" } } } },
    "/api/v1/standards": {
      get: {
        parameters: ["status", "category", "severity", "owner", "limit", "offset"].map((name) => ({
          name,
          in: "query",
          required: false,
          schema: { type: name === "limit" || name === "offset" ? "integer" : "string" }
        })),
        responses: { "200": { description: "List standards" } }
      },
      post: {
        security: [{ apiKey: [] }],
        responses: { "201": { description: "Created standard" }, "401": { description: "Missing or invalid API key" } }
      }
    },
    "/api/v1/standards/latest": {
      get: { responses: { "200": { description: "Latest active standards with standards_version" } } }
    },
    "/api/v1/standards/applicable": {
      get: {
        parameters: ["repo", "team", "language", "framework", "runtime", "environment", "changed_paths"].map((name) => ({
          name,
          in: "query",
          required: false,
          schema: { type: "string" }
        })),
        responses: { "200": { description: "Applicable standards with standards_version and match_reason" } }
      }
    },
    "/api/v1/standards/{ruleKey}": {
      get: {
        parameters: [{ name: "ruleKey", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Latest version for rule key" }, "404": { description: "Not found" } }
      },
      put: {
        security: [{ apiKey: [] }],
        parameters: [{ name: "ruleKey", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Updated standard" }, "401": { description: "Missing or invalid API key" } }
      }
    }
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key"
      }
    }
  }
};
