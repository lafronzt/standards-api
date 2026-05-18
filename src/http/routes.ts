import type { FastifyInstance } from "fastify";
import type { z } from "zod";
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
    const rules = await service.list(query.status);
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
    const body = parseWithSchema(standardBodySchema, request.body);
    const rule = await service.create(toInput(body));
    return reply.code(201).send(serializeStandard(rule));
  });

  app.put("/api/v1/standards/:ruleKey", async (request, reply) => {
    const { ruleKey } = request.params as { ruleKey: string };
    const body = parseWithSchema(updateStandardBodySchema, request.body);
    const rule = await service.createNextVersion(ruleKey, toPartialInput(body));
    return reply.code(201).send(serializeStandard(rule));
  });
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
    owner: body.owner,
    version: body.version,
    deprecatedAt: body.deprecated_at
  };
}
