import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStandardsRepository } from "../src/repositories/memory-standards-repository.js";
import { seedStandards } from "../src/seed-data.js";

async function app() {
  const fastify = await buildApp(new MemoryStandardsRepository(seedStandards), "silent");
  return fastify;
}

describe("standards api", () => {
  it("returns health", async () => {
    const fastify = await app();
    const response = await fastify.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "standards-api" });
  });

  it("creates a rule", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      payload: {
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
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ rule_key: "PERF-API-010", version: 1, status: "active" });
  });

  it("rejects duplicate rule key and version", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "POST",
      url: "/api/v1/standards",
      payload: {
        rule_key: "SRE-K8S-003",
        title: "Duplicate",
        description: "Duplicate version should fail.",
        status: "active",
        severity: "high",
        category: "reliability",
        applies_to: { frameworks: ["kubernetes"] },
        rule_text: "Duplicate rule.",
        review_guidance: "Reject duplicate.",
        owner: "platform",
        version: 1
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("conflict");
  });

  it("gets a rule", async () => {
    const fastify = await app();
    const response = await fastify.inject({ method: "GET", url: "/api/v1/standards/SRE-K8S-003" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ rule_key: "SRE-K8S-003", title: "Kubernetes readiness probes required" });
  });

  it("lists active standards", async () => {
    const fastify = await app();
    const response = await fastify.inject({ method: "GET", url: "/api/v1/standards" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(6);
    expect(response.json().data.every((rule: { status: string }) => rule.status === "active")).toBe(true);
  });

  it("filters applicable standards by metadata", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards/applicable?language=typescript&environment=production"
    });

    expect(response.statusCode).toBe(200);
    const ruleKeys = response.json().rules.map((rule: { rule_key: string }) => rule.rule_key);
    expect(ruleKeys).toContain("OBS-LOG-001");
    expect(ruleKeys).toContain("REL-NET-004");
  });

  it("matches changed paths against file patterns", async () => {
    const fastify = await app();
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/standards/applicable?changed_paths=infra/main.tf,docs/readme.md"
    });

    expect(response.statusCode).toBe(200);
    const ruleKeys = response.json().rules.map((rule: { rule_key: string }) => rule.rule_key);
    expect(ruleKeys).toContain("OPS-TF-002");
    expect(ruleKeys).toContain("SEC-SECRET-001");
    expect(ruleKeys).not.toContain("SRE-K8S-003");
  });
});
