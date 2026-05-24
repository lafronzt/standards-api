import { describe, expect, it } from "vitest";
import { MemoryStandardsRepository } from "../src/repositories/memory-standards-repository.js";
import { StandardsService } from "../src/services/standards-service.js";
import { createHandlers } from "../src/mcp/tools.js";
import { seedStandards } from "../src/seed-data.js";

function makeHandlers(standards = seedStandards) {
  const repo = new MemoryStandardsRepository(standards);
  const service = new StandardsService(repo);
  return createHandlers(service);
}

function parseResult(result: { content: [{ text: string }] }) {
  return JSON.parse(result.content[0].text);
}

describe("MCP tool handlers", () => {
  describe("listStandards", () => {
    it("returns all active standards by default", async () => {
      const { listStandards } = makeHandlers();
      const parsed = parseResult(await listStandards({ status: "active" }));
      expect(parsed.data).toHaveLength(seedStandards.length);
      expect(parsed.data[0]).toHaveProperty("rule_key");
    });

    it("filters by category", async () => {
      const { listStandards } = makeHandlers();
      const parsed = parseResult(await listStandards({ category: "reliability" }));
      expect(parsed.data.every((r: { category: string }) => r.category === "reliability")).toBe(true);
    });

    it("applies limit and offset", async () => {
      const { listStandards } = makeHandlers();
      const parsed = parseResult(await listStandards({ limit: 2, offset: 0 }));
      expect(parsed.data).toHaveLength(2);
    });
  });

  describe("getStandard", () => {
    it("returns the standard for a known rule_key", async () => {
      const { getStandard } = makeHandlers();
      const parsed = parseResult(await getStandard({ rule_key: "SRE-K8S-003" }));
      expect(parsed.rule_key).toBe("SRE-K8S-003");
    });

    it("returns a structured tool error for an unknown rule_key", async () => {
      const { getStandard } = makeHandlers();
      const result = await getStandard({ rule_key: "MISS-ING-999" });
      const r = result as { isError?: boolean; content: [{ text: string }] };
      expect(r.isError).toBe(true);
      const payload = JSON.parse(r.content[0].text);
      expect(payload.code).toBe("not_found");
      expect(payload.statusCode).toBe(404);
      expect(payload.message).toContain("MISS-ING-999");
    });
  });

  describe("latestStandards", () => {
    it("returns standards_version and rules", async () => {
      const { latestStandards } = makeHandlers();
      const parsed = parseResult(await latestStandards());
      expect(parsed).toHaveProperty("standards_version");
      expect(Array.isArray(parsed.rules)).toBe(true);
      expect(parsed.rules).toHaveLength(seedStandards.length);
    });
  });

  describe("applicableStandards", () => {
    it("maps changed_paths array to service changedPaths and returns matching rules", async () => {
      const { applicableStandards } = makeHandlers();
      const parsed = parseResult(
        await applicableStandards({
          framework: "kubernetes",
          runtime: "container",
          environment: "production",
          changed_paths: ["deploy/deployment.yaml"]
        })
      );
      const k8sRule = parsed.rules.find((r: { rule_key: string }) => r.rule_key === "SRE-K8S-003");
      expect(k8sRule).toBeDefined();
      expect(k8sRule.match_reason).toContain("changed_paths=deploy/deployment.yaml");
    });

    it("returns empty rules when no standards match the filters", async () => {
      const { applicableStandards } = makeHandlers();
      const parsed = parseResult(await applicableStandards({ repo: "nonexistent/repo", language: "cobol" }));
      expect(parsed.rules).toHaveLength(0);
    });

    it("returns globally-applicable rules when no filters are provided", async () => {
      const { applicableStandards } = makeHandlers([
        { ...seedStandards[0], ruleKey: "OPS-GLOBAL-001", title: "Global rule", appliesTo: {}, version: 1 }
      ]);
      const parsed = parseResult(await applicableStandards({}));
      expect(parsed.rules[0].match_reason).toBe("Matched globally");
    });
  });

  describe("toolError serialization", () => {
    it("includes code, statusCode, and message from AppError", async () => {
      const { getStandard } = makeHandlers();
      const result = await getStandard({ rule_key: "MISS-ING-999" });
      const r = result as { isError?: boolean; content: [{ text: string }] };
      expect(r.isError).toBe(true);
      const payload = JSON.parse(r.content[0].text);
      expect(payload).toHaveProperty("code");
      expect(payload).toHaveProperty("statusCode");
      expect(payload).toHaveProperty("message");
    });
  });
});
