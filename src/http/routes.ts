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
    version: "1.0.0",
    description: "Versioned engineering standards API for ReviewOps tooling."
  },
  paths: {
    "/health": {
      get: {
        responses: {
          "200": {
            description: "Service health",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", const: "ok" },
                    service: { type: "string", const: "standards-api" },
                    timestamp: { type: "string", format: "date-time" }
                  },
                  required: ["status", "service", "timestamp"]
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/standards": {
      get: {
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["active", "deprecated", "draft"],
              default: "active"
            }
          },
          {
            name: "category",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: [
                "reliability",
                "security",
                "observability",
                "performance",
                "cost",
                "maintainability",
                "architecture",
                "compliance"
              ]
            }
          },
          {
            name: "severity",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["critical", "high", "medium", "low", "info"]
            }
          },
          {
            name: "owner",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1 }
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500 }
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 0 }
          }
        ],
        responses: {
          "200": {
            description: "List standards",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Standard" }
                    }
                  },
                  required: ["data"]
                }
              }
            }
          },
          "400": { $ref: "#/components/responses/ValidationError" }
        }
      },
      post: {
        security: [{ apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StandardCreateRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "Created standard",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Standard" }
              }
            }
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "409": { $ref: "#/components/responses/ConflictError" }
        }
      }
    },
    "/api/v1/standards/latest": {
      get: {
        responses: {
          "200": {
            description: "Latest active standards with standards_version",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewOpsPayload" }
              }
            }
          }
        }
      }
    },
    "/api/v1/standards/applicable": {
      get: {
        parameters: [
          { name: "repo", in: "query", required: false, schema: { type: "string", minLength: 1 } },
          { name: "team", in: "query", required: false, schema: { type: "string", minLength: 1 } },
          { name: "language", in: "query", required: false, schema: { type: "string", minLength: 1 } },
          { name: "framework", in: "query", required: false, schema: { type: "string", minLength: 1 } },
          { name: "runtime", in: "query", required: false, schema: { type: "string", minLength: 1 } },
          { name: "environment", in: "query", required: false, schema: { type: "string", minLength: 1 } },
          {
            name: "changed_paths",
            in: "query",
            required: false,
            schema: {
              type: "string",
              description: "Comma-separated file paths, e.g. src/a.ts,infra/main.tf"
            }
          }
        ],
        responses: {
          "200": {
            description: "Applicable standards with standards_version and match_reason",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewOpsPayloadWithReason" }
              }
            }
          },
          "400": { $ref: "#/components/responses/ValidationError" }
        }
      }
    },
    "/api/v1/standards/{ruleKey}": {
      get: {
        parameters: [{ name: "ruleKey", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Latest version for rule key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Standard" }
              }
            }
          },
          "404": { $ref: "#/components/responses/NotFoundError" }
        }
      },
      put: {
        security: [{ apiKey: [] }],
        parameters: [{ name: "ruleKey", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StandardUpdateRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "Updated standard (draft updated in place; active/deprecated creates a new version)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Standard" }
              }
            }
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": { $ref: "#/components/responses/NotFoundError" },
          "409": { $ref: "#/components/responses/ConflictError" }
        }
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
    },
    schemas: {
      AppliesTo: {
        type: "object",
        additionalProperties: false,
        properties: {
          languages: { type: "array", items: { type: "string" } },
          frameworks: { type: "array", items: { type: "string" } },
          runtimes: { type: "array", items: { type: "string" } },
          file_patterns: { type: "array", items: { type: "string" } },
          teams: { type: "array", items: { type: "string" } },
          repos: { type: "array", items: { type: "string" } },
          environments: { type: "array", items: { type: "string" } }
        }
      },
      Standard: {
        type: "object",
        properties: {
          id: { type: "string" },
          rule_key: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "deprecated", "draft"] },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          category: {
            type: "string",
            enum: [
              "reliability",
              "security",
              "observability",
              "performance",
              "cost",
              "maintainability",
              "architecture",
              "compliance"
            ]
          },
          applies_to: { $ref: "#/components/schemas/AppliesTo" },
          rule_text: { type: "string" },
          review_guidance: { type: "string" },
          good_example: { type: ["string", "null"] },
          bad_example: { type: ["string", "null"] },
          rationale: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
          source_url: { type: ["string", "null"], format: "uri" },
          created_by: { type: ["string", "null"] },
          updated_by: { type: ["string", "null"] },
          approved_by: { type: ["string", "null"] },
          owner: { type: "string" },
          version: { type: "integer", minimum: 1 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
          deprecated_at: { type: ["string", "null"], format: "date-time" },
          match_reason: { type: "string" }
        },
        required: [
          "id",
          "rule_key",
          "title",
          "description",
          "status",
          "severity",
          "category",
          "applies_to",
          "rule_text",
          "review_guidance",
          "tags",
          "owner",
          "version",
          "created_at",
          "updated_at",
          "deprecated_at"
        ]
      },
      StandardCreateRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          rule_key: {
            type: "string",
            pattern: "^[A-Z0-9]+(?:-[A-Z0-9]+)+-\\d{3,}$"
          },
          title: { type: "string", minLength: 3 },
          description: { type: "string", minLength: 3 },
          status: { type: "string", enum: ["active", "deprecated", "draft"], default: "draft" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          category: {
            type: "string",
            enum: [
              "reliability",
              "security",
              "observability",
              "performance",
              "cost",
              "maintainability",
              "architecture",
              "compliance"
            ]
          },
          applies_to: { $ref: "#/components/schemas/AppliesTo" },
          rule_text: { type: "string", minLength: 3 },
          review_guidance: { type: "string", minLength: 3 },
          good_example: { type: ["string", "null"] },
          bad_example: { type: ["string", "null"] },
          rationale: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" }, default: [] },
          source_url: { type: ["string", "null"], format: "uri" },
          created_by: { type: ["string", "null"] },
          updated_by: { type: ["string", "null"] },
          approved_by: { type: ["string", "null"] },
          owner: { type: "string", minLength: 1 },
          version: { type: "integer", minimum: 1, default: 1 },
          deprecated_at: { type: ["string", "null"], format: "date-time" }
        },
        required: [
          "rule_key",
          "title",
          "description",
          "severity",
          "category",
          "applies_to",
          "rule_text",
          "review_guidance",
          "owner"
        ],
        description: "If status is deprecated, deprecated_at is required."
      },
      StandardUpdateRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 3 },
          description: { type: "string", minLength: 3 },
          status: { type: "string", enum: ["active", "deprecated", "draft"] },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          category: {
            type: "string",
            enum: [
              "reliability",
              "security",
              "observability",
              "performance",
              "cost",
              "maintainability",
              "architecture",
              "compliance"
            ]
          },
          applies_to: { $ref: "#/components/schemas/AppliesTo" },
          rule_text: { type: "string", minLength: 3 },
          review_guidance: { type: "string", minLength: 3 },
          good_example: { type: ["string", "null"] },
          bad_example: { type: ["string", "null"] },
          rationale: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
          source_url: { type: ["string", "null"], format: "uri" },
          created_by: { type: ["string", "null"] },
          updated_by: { type: ["string", "null"] },
          approved_by: { type: ["string", "null"] },
          owner: { type: "string", minLength: 1 },
          version: { type: "integer", minimum: 1 },
          deprecated_at: { type: ["string", "null"], format: "date-time" }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {}
            },
            required: ["code", "message"]
          }
        },
        required: ["error"]
      },
      ReviewOpsPayload: {
        type: "object",
        properties: {
          standards_version: { type: "string" },
          rules: {
            type: "array",
            items: { $ref: "#/components/schemas/Standard" }
          }
        },
        required: ["standards_version", "rules"]
      },
      ReviewOpsPayloadWithReason: {
        type: "object",
        properties: {
          standards_version: { type: "string" },
          rules: {
            type: "array",
            items: {
              allOf: [
                { $ref: "#/components/schemas/Standard" },
                {
                  type: "object",
                  properties: {
                    match_reason: { type: "string" }
                  },
                  required: ["match_reason"]
                }
              ]
            }
          }
        },
        required: ["standards_version", "rules"]
      }
    },
    responses: {
      ValidationError: {
        description: "Request validation failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" }
          }
        }
      },
      UnauthorizedError: {
        description: "Missing or invalid API key",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" }
          }
        }
      },
      NotFoundError: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" }
          }
        }
      },
      ConflictError: {
        description: "Conflict",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" }
          }
        }
      }
    }
  }
};
