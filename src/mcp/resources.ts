import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StandardsService } from "../services/standards-service.js";
import { serializeReviewOpsPayload, serializeStandard } from "../http/serializers.js";

export function registerResources(server: McpServer, service: StandardsService): void {
  server.registerResource(
    "latest-standards",
    "standards://latest",
    {
      description: "Latest active engineering standards payload, including standards_version fingerprint.",
      mimeType: "application/json"
    },
    async (_uri) => {
      const payload = await service.latestPayload();
      return {
        contents: [
          {
            uri: "standards://latest",
            mimeType: "application/json",
            text: JSON.stringify(serializeReviewOpsPayload(payload), null, 2)
          }
        ]
      };
    }
  );

  const ruleTemplate = new ResourceTemplate("standards://rule/{rule_key}", { list: undefined });

  server.registerResource(
    "standard-by-rule-key",
    ruleTemplate,
    {
      description: "A single engineering standard by rule key.",
      mimeType: "application/json"
    },
    async (uri, { rule_key }) => {
      const key = Array.isArray(rule_key) ? rule_key[0] : rule_key;
      const rule = await service.getLatest(key);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(serializeStandard(rule), null, 2)
          }
        ]
      };
    }
  );
}
