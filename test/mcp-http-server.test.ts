import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { isAuthorized, createMcpHttpHandler } from "../src/mcp/http-server.js";
import { MemoryStandardsRepository } from "../src/repositories/memory-standards-repository.js";
import { StandardsService } from "../src/services/standards-service.js";
import { seedStandards } from "../src/seed-data.js";

describe("isAuthorized", () => {
  it("returns false when MCP_API_KEY is undefined", () => {
    expect(isAuthorized("any-key", undefined)).toBe(false);
  });

  it("returns false when MCP_API_KEY is empty string", () => {
    expect(isAuthorized("any-key", "")).toBe(false);
  });

  it("returns false when header is missing", () => {
    expect(isAuthorized(undefined, "secret")).toBe(false);
  });

  it("returns false when header does not match the env key", () => {
    expect(isAuthorized("wrong-key", "secret")).toBe(false);
  });

  it("returns true when header matches the env key", () => {
    expect(isAuthorized("secret", "secret")).toBe(true);
  });

  it("uses the first value when header is an array", () => {
    expect(isAuthorized(["secret", "other"], "secret")).toBe(true);
    expect(isAuthorized(["other", "secret"], "secret")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Session lifecycle integration tests
// ---------------------------------------------------------------------------

const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.0.0" }
  }
};

// Streamable HTTP requires both Content-Type and Accept headers on POST requests.
const MCP_POST_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream"
};

function makeTestServer() {
  const repo = new MemoryStandardsRepository(seedStandards);
  const service = new StandardsService(repo);
  const { handler, sessions } = createMcpHttpHandler(service);

  const server = createServer(async (req, res) => {
    await handler(req, res);
  });

  return new Promise<{
    base: string;
    sessions: ReturnType<typeof createMcpHttpHandler>["sessions"];
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        sessions,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res())))
      });
    });
  });
}

describe("MCP HTTP session lifecycle", () => {
  it("returns 400 for POST without session ID and non-initialize body", async () => {
    const { base, close } = await makeTestServer();
    try {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: MCP_POST_HEADERS,
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 })
      });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it("returns 400 for GET without a session ID", async () => {
    const { base, close } = await makeTestServer();
    try {
      const res = await fetch(`${base}/mcp`, { method: "GET" });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it("returns 400 for DELETE without a session ID", async () => {
    const { base, close } = await makeTestServer();
    try {
      const res = await fetch(`${base}/mcp`, { method: "DELETE" });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it("creates a session on initialize and stores it in the sessions map", async () => {
    const { base, sessions, close } = await makeTestServer();
    try {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: MCP_POST_HEADERS,
        body: JSON.stringify(INIT_BODY)
      });
      expect(res.status).toBe(200);
      const sessionId = res.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      expect(sessions.has(sessionId!)).toBe(true);
    } finally {
      await close();
    }
  });

  it("routes a subsequent POST with a valid session ID to the transport", async () => {
    const { base, close } = await makeTestServer();
    try {
      // Initialize to get a session
      const initRes = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: MCP_POST_HEADERS,
        body: JSON.stringify(INIT_BODY)
      });
      const sessionId = initRes.headers.get("mcp-session-id")!;

      // Send initialized notification (required by MCP before issuing requests)
      const notifyRes = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: { ...MCP_POST_HEADERS, "mcp-session-id": sessionId },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })
      });
      // Notification is fire-and-forget — transport returns 202
      expect([200, 202]).toContain(notifyRes.status);
    } finally {
      await close();
    }
  });

  it("returns 400 for GET with an unknown session ID", async () => {
    const { base, close } = await makeTestServer();
    try {
      const res = await fetch(`${base}/mcp`, {
        method: "GET",
        headers: { "mcp-session-id": "nonexistent-session-id" }
      });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });
});
