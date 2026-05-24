import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PrismaClient } from "@prisma/client";
import { PrismaStandardsRepository } from "../repositories/prisma-standards-repository.js";
import { StandardsService } from "../services/standards-service.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";

const prisma = new PrismaClient();
const repository = new PrismaStandardsRepository(prisma);
const service = new StandardsService(repository);

const server = new McpServer({
  name: "standards-api",
  version: "1.0.0"
});

registerTools(server, service);
registerResources(server, service);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function shutdown(): Promise<void> {
  await server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
