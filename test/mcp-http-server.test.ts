import { describe, expect, it } from "vitest";
import { isAuthorized } from "../src/mcp/http-server.js";

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
