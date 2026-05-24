import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { StandardsService } from "../services/standards-service.js";
import { serializeReviewOpsPayload, serializeStandard } from "../http/serializers.js";
import { categories, severities, statuses } from "../domain/standard.js";

function toolError(err: unknown): { isError: true; content: [{ type: "text"; text: string }] } {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: message }] };
}

function toolResult(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function registerTools(server: McpServer, service: StandardsService): void {
  server.registerTool(
    "list_standards",
    {
      description: "List engineering standards with optional filters. Returns the latest version of each matching standard.",
      inputSchema: {
        status: z.enum(statuses).optional().default("active"),
        category: z.enum(categories).optional(),
        severity: z.enum(severities).optional(),
        owner: z.string().trim().min(1).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional()
      }
    },
    async (input) => {
      try {
        const rules = await service.list(input);
        return toolResult({ data: rules.map(serializeStandard) });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_standard",
    {
      description: "Get the latest version of a single engineering standard by its rule key.",
      inputSchema: {
        rule_key: z.string().trim().min(1)
      }
    },
    async ({ rule_key }) => {
      try {
        const rule = await service.getLatest(rule_key);
        return toolResult(serializeStandard(rule));
      } catch (err) {
        if (err instanceof NotFoundError) {
          return toolError(err);
        }
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "latest_standards",
    {
      description: "Returns the latest active standards payload used by review tooling, including a standards_version fingerprint."
    },
    async () => {
      try {
        const payload = await service.latestPayload();
        return toolResult(serializeReviewOpsPayload(payload));
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "applicable_standards",
    {
      description: "Returns active standards that apply to a given repo, team, language, framework, runtime, environment, or set of changed file paths. All filters are optional.",
      inputSchema: {
        repo: z.string().trim().min(1).optional(),
        team: z.string().trim().min(1).optional(),
        language: z.string().trim().min(1).optional(),
        framework: z.string().trim().min(1).optional(),
        runtime: z.string().trim().min(1).optional(),
        environment: z.string().trim().min(1).optional(),
        changed_paths: z.array(z.string().trim().min(1)).optional()
      }
    },
    async ({ repo, team, language, framework, runtime, environment, changed_paths }) => {
      try {
        const payload = await service.applicable({
          repo,
          team,
          language,
          framework,
          runtime,
          environment,
          changedPaths: changed_paths
        });
        return toolResult(serializeReviewOpsPayload(payload));
      } catch (err) {
        if (err instanceof ValidationError) {
          return toolError(err);
        }
        return toolError(err);
      }
    }
  );
}
