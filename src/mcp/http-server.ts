import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from "@prisma/client";
import { PrismaStandardsRepository } from "../repositories/prisma-standards-repository.js";
import { StandardsService } from "../services/standards-service.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";

type Session = { server: McpServer; transport: StreamableHTTPServerTransport };
const sessions = new Map<string, Session>();

/**
 * Returns true if the request carries a valid API key.
 * Exported for unit testing.
 */
export function isAuthorized(
  headerValue: string | string[] | undefined,
  envKey: string | undefined
): boolean {
  if (!envKey) return false;
  const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return key === envKey;
}

function rejectUnauthorized(res: ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Missing or invalid API key" }));
}

function rejectBadRequest(res: ServerResponse, message: string): void {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null
    })
  );
}

function serverError(res: ServerResponse): void {
  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      })
    );
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(raw.length > 0 ? (JSON.parse(raw) as unknown) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function createMcpServer(service: StandardsService): McpServer {
  const server = new McpServer({ name: "standards-api", version: "1.0.0" });
  registerTools(server, service);
  registerResources(server, service);
  return server;
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  service: StandardsService
): Promise<void> {
  try {
    const body = await readBody(req);
    const sessionId = req.headers["mcp-session-id"];
    const existingId = Array.isArray(sessionId) ? sessionId[0] : sessionId;

    if (existingId && sessions.has(existingId)) {
      const { transport } = sessions.get(existingId)!;
      await transport.handleRequest(req, res, body);
      return;
    }

    if (!existingId && isInitializeRequest(body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { server: mcpServer, transport });
        }
      });

      const mcpServer = createMcpServer(service);

      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) sessions.delete(id);
      };

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    rejectBadRequest(res, "No valid session ID provided");
  } catch (err) {
    console.error("Error handling POST /mcp:", err);
    serverError(res);
  }
}

async function handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers["mcp-session-id"];
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  if (!id || !sessions.has(id)) {
    rejectBadRequest(res, "Invalid or missing session ID");
    return;
  }

  try {
    const { transport } = sessions.get(id)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Error handling GET /mcp:", err);
    serverError(res);
  }
}

async function handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers["mcp-session-id"];
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  if (!id || !sessions.has(id)) {
    rejectBadRequest(res, "Invalid or missing session ID");
    return;
  }

  try {
    const { transport } = sessions.get(id)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Error handling DELETE /mcp:", err);
    serverError(res);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const MCP_HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT ?? "3001", 10);

  const prisma = new PrismaClient();
  const repository = new PrismaStandardsRepository(prisma);
  const service = new StandardsService(repository);

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "";
    const method = req.method ?? "";

    if (url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (!isAuthorized(req.headers["x-api-key"], process.env.MCP_API_KEY)) {
      rejectUnauthorized(res);
      return;
    }

    if (method === "POST") {
      await handlePost(req, res, service);
    } else if (method === "GET") {
      await handleGet(req, res);
    } else if (method === "DELETE") {
      await handleDelete(req, res);
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
    }
  });

  async function shutdown(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
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

  httpServer.listen(MCP_HTTP_PORT, () => {
    console.log(`MCP Streamable HTTP server listening on port ${MCP_HTTP_PORT}`);
  });
}
