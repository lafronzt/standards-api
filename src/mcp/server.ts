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

function handleSignal(signal: string): void {
  shutdown()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`Shutdown error on ${signal}:`, err);
      process.exit(1);
    });
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
