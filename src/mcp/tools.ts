import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppError } from "../domain/errors.js";
import type { StandardsService } from "../services/standards-service.js";
import { serializeReviewOpsPayload, serializeStandard } from "../http/serializers.js";
import { categories, severities, statuses } from "../domain/standard.js";
import type { StandardCategory, StandardSeverity, StandardStatus } from "../domain/standard.js";

export const RULE_KEY_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{3,}$/;

type ToolResult = { content: [{ type: "text"; text: string }] };
type ToolError = { isError: true; content: [{ type: "text"; text: string }] };

function toolError(err: unknown): ToolError {
  if (err instanceof AppError) {
    const payload: Record<string, unknown> = {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode
    };
    if (err.details !== undefined) {
      payload.details = err.details;
    }
    return { isError: true, content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
  console.error("Unexpected MCP tool error:", err);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ code: "internal_error", message: "An unexpected error occurred", statusCode: 500 }) }] };
}

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export type ListStandardsInput = {
  status?: StandardStatus;
  category?: StandardCategory;
  severity?: StandardSeverity;
  owner?: string;
  limit?: number;
  offset?: number;
};

export type GetStandardInput = { rule_key: string };

export type ApplicableStandardsInput = {
  repo?: string;
  team?: string;
  language?: string;
  framework?: string;
  runtime?: string;
  environment?: string;
  changed_paths?: string[];
};

export function createHandlers(service: StandardsService) {
  return {
    async listStandards({ status = "active", ...rest }: ListStandardsInput = {}): Promise<ToolResult | ToolError> {
      try {
        const rules = await service.list({ status, ...rest });
        return toolResult({ data: rules.map(serializeStandard) });
      } catch (err) {
        return toolError(err);
      }
    },

    async getStandard({ rule_key }: GetStandardInput): Promise<ToolResult | ToolError> {
      try {
        const rule = await service.getLatest(rule_key);
        return toolResult(serializeStandard(rule));
      } catch (err) {
        return toolError(err);
      }
    },

    async latestStandards(): Promise<ToolResult | ToolError> {
      try {
        const payload = await service.latestPayload();
        return toolResult(serializeReviewOpsPayload(payload));
      } catch (err) {
        return toolError(err);
      }
    },

    async applicableStandards({
      repo,
      team,
      language,
      framework,
      runtime,
      environment,
      changed_paths
    }: ApplicableStandardsInput = {}): Promise<ToolResult | ToolError> {
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
        return toolError(err);
      }
    }
  };
}

export function registerTools(server: McpServer, service: StandardsService): void {
  const handlers = createHandlers(service);

  server.registerTool(
    "list_standards",
    {
      description: "List engineering standards with optional filters. Returns the latest version of each matching standard.",
      inputSchema: {
        status: z.enum(statuses).optional().default("active"),
        category: z.enum(categories).optional(),
        severity: z.enum(severities).optional(),
        owner: z.string().trim().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional()
      }
    },
    handlers.listStandards
  );

  server.registerTool(
    "get_standard",
    {
      description: "Get the latest version of a single engineering standard by its rule key.",
      inputSchema: {
        rule_key: z.string().trim().regex(RULE_KEY_REGEX, "rule_key must match pattern like SRE-K8S-003")
      }
    },
    handlers.getStandard
  );

  server.registerTool(
    "latest_standards",
    {
      description: "Returns the latest active standards payload used by review tooling, including a standards_version fingerprint."
    },
    handlers.latestStandards
  );

  server.registerTool(
    "applicable_standards",
    {
      description:
        "Returns active standards that apply to a given repo, team, language, framework, runtime, environment, or set of changed file paths. All filters are optional.",
      inputSchema: {
        repo: z.string().trim().min(1).optional(),
        team: z.string().trim().min(1).optional(),
        language: z.string().trim().min(1).optional(),
        framework: z.string().trim().min(1).optional(),
        runtime: z.string().trim().min(1).optional(),
        environment: z.string().trim().min(1).optional(),
        changed_paths: z.array(z.string().trim().min(1)).min(1).optional()
      }
    },
    handlers.applicableStandards
  );
}
