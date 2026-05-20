import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { StandardInput } from "../src/domain/standard.js";
import { MemoryStandardsRepository } from "../src/repositories/memory-standards-repository.js";
import { seedStandards } from "../src/seed-data.js";

async function app(initial: StandardInput[] = seedStandards) {
  return buildApp(new MemoryStandardsRepository(initial), "silent");
}

const createdRule = {
  rule_key: "PERF-API-010",
  title: "Pagination required for collection endpoints",
  description: "Collection endpoints must support bounded pagination.",
  status: "active",
  severity: "medium",
  category: "performance",
  applies_to: { languages: ["typescript"] },
  rule_text: "Collection endpoints must enforce page size limits.",
  review_guidance: "Look for unbounded list queries and missing limit parameters.",
  owner: "api-platform",
  version: 1
};

afterEach(() => {
  delete process.env.STANDARDS_API_KEY;
  process.env.NODE_ENV = "test";
});

describe("standards api", () => {
  it("returns health", async () => {
    const fastify = await app();
    const response = await fastify.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "standards-api" });
  });

  it("creates a rule with second-pass fields", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      payload: {
        ...createdRule,
        rationale: "Pagination protects the database.",
        tags: ["api", "pagination"],
        source_url: "https://example.com/standards/pagination",
        created_by: "reviewops",
        updated_by: "reviewops",
        approved_by: "architecture"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      rule_key: "PERF-API-010",
      version: 1,
      status: "active",
      tags: ["api", "pagination"],
      source_url: "https://example.com/standards/pagination"
    });
  });

  it("rejects duplicate rule key and version", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      payload: {
        ...createdRule,
        rule_key: "SRE-K8S-003",
        title: "Duplicate",
        description: "Duplicate version should fail.",
        severity: "high",
        category: "reliability",
        applies_to: { frameworks: ["kubernetes"] },
        rule_text: "Duplicate rule.",
        review_guidance: "Reject duplicate.",
        owner: "platform"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("conflict");
  });

  it("updates active rules by creating a new active version and deprecating the previous active version", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "PUT",
      url: "/api/v1/standards/SRE-K8S-003",
      payload: {
        title: "Kubernetes readiness probes required for production",
        updated_by: "platform"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      rule_key: "SRE-K8S-003",
      version: 2,
      status: "active",
      updated_by: "platform"
    });

    const deprecated = await fastify.inject({ method: "GET", url: "/api/v1/standards?status=deprecated" });
    expect(deprecated.json().data).toHaveLength(1);
    expect(deprecated.json().data[0]).toMatchObject({
      rule_key: "SRE-K8S-003",
      version: 1,
      status: "deprecated"
    });
    expect(deprecated.json().data[0].deprecated_at).toEqual(expect.any(String));

    const active = await fastify.inject({ method: "GET", url: "/api/v1/standards?status=active" });
    const activeK8s = active.json().data.filter((rule: { rule_key: string }) => rule.rule_key === "SRE-K8S-003");
    expect(activeK8s).toHaveLength(1);
    expect(activeK8s[0].version).toBe(2);
  });

  it("updates draft rules in place", async () => {
    const fastify = await app([
      {
        ...seedStandards[0],
        status: "draft",
        version: 1
      }
    ]);

    const response = await fastify.inject({
      method: "PUT",
      url: "/api/v1/standards/SRE-K8S-003",
      payload: { title: "Draft title changed" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ title: "Draft title changed", version: 1, status: "draft" });
  });

  it("omits deprecated rules from latest and applicable", async () => {
    const fastify = await app();
    await fastify.inject({
      method: "PUT",
      url: "/api/v1/standards/SRE-K8S-003",
      payload: { title: "Kubernetes readiness probes required for production" }
    });

    const latest = await fastify.inject({ method: "GET", url: "/api/v1/standards/latest" });
    const latestK8s = latest.json().rules.filter((rule: { rule_key: string }) => rule.rule_key === "SRE-K8S-003");
    expect(latestK8s).toHaveLength(1);
    expect(latestK8s[0].version).toBe(2);

    const applicable = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards/applicable?framework=kubernetes&runtime=container&environment=production&changed_paths=deploy/deployment.yaml"
    });
    const applicableK8s = applicable.json().rules.filter((rule: { rule_key: string }) => rule.rule_key === "SRE-K8S-003");
    expect(applicableK8s).toHaveLength(1);
    expect(applicableK8s[0].version).toBe(2);
  });

  it("includes standards_version in latest and applicable responses", async () => {
    const fastify = await app();
    const latest = await fastify.inject({ method: "GET", url: "/api/v1/standards/latest" });
    const applicable = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards/applicable?language=typescript&changed_paths=src/client.ts"
    });

    expect(latest.json().standards_version).toMatch(/T.*Z-count-6$/);
    expect(applicable.json().standards_version).toMatch(/T.*Z-count-\d+$/);
  });

  it("matches applicable standards deterministically by metadata", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards/applicable?language=typescript&environment=production"
    });

    expect(response.statusCode).toBe(200);
    const rules = response.json().rules;
    const ruleKeys = rules.map((rule: { rule_key: string }) => rule.rule_key);
    expect(ruleKeys).toContain("OBS-LOG-001");
    expect(ruleKeys).not.toContain("SRE-API-001");
    expect(rules.find((rule: { rule_key: string }) => rule.rule_key === "OBS-LOG-001").match_reason).toContain(
      "language=typescript"
    );
  });

  it("matches changed paths against file pattern constraints", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards/applicable?framework=terraform&team=sre&changed_paths=infra/main.tf,docs/readme.md"
    });

    expect(response.statusCode).toBe(200);
    const opsRule = response.json().rules.find((rule: { rule_key: string }) => rule.rule_key === "OPS-TF-002");
    expect(opsRule).toMatchObject({ rule_key: "OPS-TF-002" });
    expect(opsRule.match_reason).toBe("Matched team=sre and Matched framework=terraform and Matched changed_paths=infra/main.tf");
  });

  it("treats empty applies_to fields as globally applicable", async () => {
    const fastify = await app([
      {
        ...seedStandards[0],
        ruleKey: "OPS-GLOBAL-001",
        title: "Global rule",
        appliesTo: {},
        version: 1
      }
    ]);

    const response = await fastify.inject({ method: "GET", url: "/api/v1/standards/applicable" });
    expect(response.json().rules).toHaveLength(1);
    expect(response.json().rules[0]).toMatchObject({
      rule_key: "OPS-GLOBAL-001",
      match_reason: "Matched globally"
    });
  });

  it("supports list filters and pagination", async () => {
    const fastify = await app();
    const filtered = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards?status=active&category=reliability&severity=high&owner=platform"
    });
    expect(filtered.json().data.map((rule: { rule_key: string }) => rule.rule_key)).toEqual(["REL-NET-004", "SRE-K8S-003"]);

    const paged = await fastify.inject({ method: "GET", url: "/api/v1/standards?limit=2&offset=1" });
    expect(paged.json().data).toHaveLength(2);
  });

  it("requires API key for write endpoints when configured", async () => {
    process.env.STANDARDS_API_KEY = "secret";
    const fastify = await app();

    const missing = await fastify.inject({ method: "POST", url: "/api/v1/standards", payload: createdRule });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.message).toBe("Missing or invalid API key");

    const created = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      headers: { "x-api-key": "secret" },
      payload: createdRule
    });
    expect(created.statusCode).toBe(201);
  });

  it("requires API key for write endpoints in production even without a configured key", async () => {
    process.env.NODE_ENV = "production";
    const fastify = await app();
    const response = await fastify.inject({ method: "POST", url: "/api/v1/standards", payload: createdRule });

    expect(response.statusCode).toBe(401);
  });

  it("returns validation errors for bad filters and changed_paths", async () => {
    const fastify = await app();
    const badLimit = await fastify.inject({ method: "GET", url: "/api/v1/standards?limit=0" });
    const badPaths = await fastify.inject({ method: "GET", url: "/api/v1/standards/applicable?changed_paths=src/a.ts," });

    expect(badLimit.statusCode).toBe(400);
    expect(badPaths.statusCode).toBe(400);
  });

  it("exposes OpenAPI and docs endpoints", async () => {
    const fastify = await app();
    const openapi = await fastify.inject({ method: "GET", url: "/openapi.json" });
    const docs = await fastify.inject({ method: "GET", url: "/docs" });

    expect(openapi.statusCode).toBe(200);
    expect(openapi.json()).toMatchObject({ openapi: "3.1.0" });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
  });

  it("rejects appliesTo fields with empty arrays", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      payload: { ...createdRule, rule_key: "VALID-SCHEMA-001", applies_to: { languages: [] } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_error");
  });

  it("normalizes applies_to metadata to lowercase but preserves file_patterns casing", async () => {
    const fastify = await app([]);
    const response = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      payload: {
        ...createdRule,
        rule_key: "NORM-CASE-001",
        applies_to: { languages: ["TypeScript", "GO"], file_patterns: ["src/**/*.TS"] }
      }
    });

    expect(response.statusCode).toBe(201);
    const rule = response.json();
    expect(rule.applies_to.languages).toEqual(["typescript", "go"]);
    expect(rule.applies_to.file_patterns).toEqual(["src/**/*.TS"]);
  });

  it("returns 429 with structured error when rate limit is exceeded", async () => {
    const fastify = await buildApp(new MemoryStandardsRepository([]), "silent", { rateLimitMax: 2 });

    await fastify.inject({ method: "GET", url: "/health" });
    await fastify.inject({ method: "GET", url: "/health" });
    const response = await fastify.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: {
        code: "rate_limit_exceeded",
        message: "Too many requests",
        details: { limit: 2 }
      }
    });
    expect(response.json().error.request_id).toBeDefined();
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("concurrent creation of the same rule_key at the same version returns 409 for the second request", async () => {
    const fastify = await app();
    const payload = {
      ...createdRule,
      rule_key: "PERF-API-099",
      version: 1
    };

    const results = await Promise.allSettled([
      fastify.inject({ method: "POST", url: "/api/v1/standards", payload }),
      fastify.inject({ method: "POST", url: "/api/v1/standards", payload })
    ]);

    const statuses = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fastify.inject>>> => r.status === "fulfilled")
      .map((r) => r.value.statusCode);

    expect(statuses).toHaveLength(2);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);
  });
});
