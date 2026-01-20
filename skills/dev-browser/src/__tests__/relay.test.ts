import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { serveRelay, RelayError } from "../relay";
import type { RelayServer } from "../relay";

// Type definitions for API responses
interface ServerInfoResponse {
  wsEndpoint: string;
  extensionConnected: boolean;
  mode: string;
}

interface HealthResponse {
  status: string;
  uptime: number;
  extension: {
    connected: boolean;
    lastPing: number;
    healthy: boolean;
  };
  stats: {
    connectedTargets: number;
    namedPages: number;
    playwrightClients: number;
    pendingRequests: number;
  };
}

interface PagesResponse {
  pages: string[];
}

interface ErrorResponse {
  error: string;
  code?: string;
}

interface SuccessResponse {
  success: boolean;
}

describe("Relay Server", () => {
  let server: RelayServer;
  const TEST_PORT = 19222;

  beforeAll(async () => {
    server = await serveRelay({ port: TEST_PORT, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await server.stop();
  });

  describe("HTTP Endpoints", () => {
    test("GET / returns server info", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
      expect(res.ok).toBe(true);

      const data = (await res.json()) as ServerInfoResponse;
      expect(data).toHaveProperty("wsEndpoint");
      expect(data).toHaveProperty("extensionConnected", false);
      expect(data).toHaveProperty("mode", "extension");
      expect(data.wsEndpoint).toBe(`ws://127.0.0.1:${TEST_PORT}/cdp`);
    });

    test("GET /health returns health status", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      // Should be 503 because extension is not connected
      expect(res.status).toBe(503);

      const data = (await res.json()) as HealthResponse;
      expect(data).toHaveProperty("status", "degraded");
      expect(data).toHaveProperty("uptime");
      expect(data.extension).toHaveProperty("connected", false);
      expect(data.extension).toHaveProperty("healthy", false);
      expect(data.stats).toHaveProperty("connectedTargets", 0);
      expect(data.stats).toHaveProperty("namedPages", 0);
      expect(data.stats).toHaveProperty("playwrightClients", 0);
      expect(data.stats).toHaveProperty("pendingRequests", 0);
    });

    test("GET /pages returns empty array when no pages", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pages`);
      expect(res.ok).toBe(true);

      const data = (await res.json()) as PagesResponse;
      expect(data).toHaveProperty("pages");
      expect(data.pages).toEqual([]);
    });

    test("POST /pages returns error when extension not connected", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-page" }),
      });

      expect(res.status).toBe(503);
      const data = (await res.json()) as ErrorResponse;
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Extension not connected");
    });

    test("POST /pages returns 400 when name is missing", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data).toHaveProperty("error", "name is required");
    });

    test("DELETE /pages/:name returns success false when page doesn't exist", async () => {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pages/nonexistent`, {
        method: "DELETE",
      });

      expect(res.ok).toBe(true);
      const data = (await res.json()) as SuccessResponse;
      expect(data).toHaveProperty("success", false);
    });
  });
});

describe("RelayError", () => {
  test("creates error with code", () => {
    const error = new RelayError("Test error", "EXTENSION_NOT_CONNECTED");
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("EXTENSION_NOT_CONNECTED");
    expect(error.name).toBe("RelayError");
  });

  test("creates error with cause", () => {
    const cause = new Error("Original error");
    const error = new RelayError("Test error", "INTERNAL_ERROR", cause);
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.cause).toBe(cause);
  });
});

describe("Relay Server - Multiple Instances", () => {
  test("can start and stop multiple times", async () => {
    const server1 = await serveRelay({ port: 19223, host: "127.0.0.1" });

    // Verify server is running
    const res1 = await fetch("http://127.0.0.1:19223/");
    expect(res1.ok).toBe(true);

    // Stop server
    await server1.stop();

    // Server should be stopped (connection refused)
    await expect(fetch("http://127.0.0.1:19223/")).rejects.toThrow();

    // Start again on same port
    const server2 = await serveRelay({ port: 19223, host: "127.0.0.1" });

    // Verify it's running
    const res2 = await fetch("http://127.0.0.1:19223/");
    expect(res2.ok).toBe(true);

    await server2.stop();
  });
});

describe("Relay Server - WebSocket Endpoints", () => {
  let wsServer: RelayServer;
  const WS_TEST_PORT = 19224;

  beforeEach(async () => {
    wsServer = await serveRelay({ port: WS_TEST_PORT, host: "127.0.0.1" });
  });

  afterEach(async () => {
    await wsServer.stop();
  });

  test("CDP endpoint accepts WebSocket connections", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_TEST_PORT}/cdp`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.close();
        resolve();
      };
      ws.onerror = () => reject(new Error("WebSocket error"));
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
  });

  test("Extension endpoint accepts WebSocket connections", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_TEST_PORT}/extension`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.close();
        resolve();
      };
      ws.onerror = () => reject(new Error("WebSocket error"));
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
  });

  test("Extension connection updates health status", async () => {
    // Before connection, health should be degraded
    const healthBefore = await fetch(`http://127.0.0.1:${WS_TEST_PORT}/health`);
    expect(healthBefore.status).toBe(503);

    // Connect extension
    const ws = new WebSocket(`ws://127.0.0.1:${WS_TEST_PORT}/extension`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket error"));
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });

    // After connection, root should show connected
    const infoAfter = await fetch(`http://127.0.0.1:${WS_TEST_PORT}/`);
    const infoData = (await infoAfter.json()) as ServerInfoResponse;
    expect(infoData.extensionConnected).toBe(true);

    ws.close();
  });
});
