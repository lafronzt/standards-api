import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoryStandardsRepository } from "../src/repositories/memory-standards-repository.js";
import { StandardsService } from "../src/services/standards-service.js";
import { registerTools } from "../src/mcp/tools.js";
import { seedStandards } from "../src/seed-data.js";

function makeServer(standards = seedStandards) {
  const repo = new MemoryStandardsRepository(standards);
  const service = new StandardsService(repo);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, service);
  return server;
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => unknown }> })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler(args);
}

describe("MCP tools", () => {
  describe("list_standards", () => {
    it("returns all active standards by default", async () => {
      const server = makeServer();
      const result = await callTool(server, "list_standards", {});
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed.data).toHaveLength(seedStandards.length);
      expect(parsed.data[0]).toHaveProperty("rule_key");
    });

    it("filters by category", async () => {
      const server = makeServer();
      const result = await callTool(server, "list_standards", { category: "reliability" });
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed.data.every((r: { category: string }) => r.category === "reliability")).toBe(true);
    });

    it("applies limit and offset", async () => {
      const server = makeServer();
      const result = await callTool(server, "list_standards", { limit: 2, offset: 0 });
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed.data).toHaveLength(2);
    });
  });

  describe("get_standard", () => {
    it("returns the standard for a valid rule_key", async () => {
      const server = makeServer();
      const result = await callTool(server, "get_standard", { rule_key: "SRE-K8S-003" });
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed.rule_key).toBe("SRE-K8S-003");
    });

    it("returns a tool error for an unknown rule_key", async () => {
      const server = makeServer();
      const result = await callTool(server, "get_standard", { rule_key: "MISS-ING-999" });
      const r = result as { isError?: boolean; content: [{ text: string }] };
      expect(r.isError).toBe(true);
      const payload = JSON.parse(r.content[0].text);
      expect(payload.code).toBe("not_found");
    });
  });

  describe("latest_standards", () => {
    it("returns standards_version and rules", async () => {
      const server = makeServer();
      const result = await callTool(server, "latest_standards", {});
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed).toHaveProperty("standards_version");
      expect(Array.isArray(parsed.rules)).toBe(true);
    });
  });

  describe("applicable_standards", () => {
    it("maps changed_paths array to service changedPaths and returns matching rules", async () => {
      const server = makeServer();
      const result = await callTool(server, "applicable_standards", {
        framework: "kubernetes",
        runtime: "container",
        environment: "production",
        changed_paths: ["deploy/deployment.yaml"]
      });
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      const k8sRule = parsed.rules.find((r: { rule_key: string }) => r.rule_key === "SRE-K8S-003");
      expect(k8sRule).toBeDefined();
      expect(k8sRule.match_reason).toContain("changed_paths=deploy/deployment.yaml");
    });

    it("returns an empty rules array when no standards match the filters", async () => {
      const server = makeServer();
      const result = await callTool(server, "applicable_standards", {
        repo: "nonexistent/repo",
        language: "cobol"
      });
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed.rules).toHaveLength(0);
    });

    it("returns all active standards when no filters are provided", async () => {
      const server = makeServer([
        { ...seedStandards[0], ruleKey: "OPS-GLOBAL-001", title: "Global rule", appliesTo: {}, version: 1 }
      ]);
      const result = await callTool(server, "applicable_standards", {});
      const parsed = JSON.parse((result as { content: [{ text: string }] }).content[0].text);
      expect(parsed.rules[0].match_reason).toBe("Matched globally");
    });
  });

  describe("toolError serialization", () => {
    it("includes AppError code and details in tool error text", async () => {
      const server = makeServer();
      const result = await callTool(server, "get_standard", { rule_key: "MISS-ING-999" });
      const r = result as { isError?: boolean; content: [{ text: string }] };
      expect(r.isError).toBe(true);
      const payload = JSON.parse(r.content[0].text);
      expect(payload).toHaveProperty("code");
      expect(payload).toHaveProperty("message");
    });
  });
});
