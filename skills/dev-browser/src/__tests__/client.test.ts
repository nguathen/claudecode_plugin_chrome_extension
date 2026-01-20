import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { connect, waitForPageLoad } from "../client";
import type { DevBrowserClient, ServerInfo, WaitForPageLoadResult } from "../client";
import { serveRelay } from "../relay";
import type { RelayServer } from "../relay";

describe("Client - connect()", () => {
  let server: RelayServer;
  const TEST_PORT = 19225;

  beforeAll(async () => {
    server = await serveRelay({ port: TEST_PORT, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await server.stop();
  });

  test("connects to server and returns client interface", async () => {
    const client = await connect(`http://127.0.0.1:${TEST_PORT}`);

    expect(client).toHaveProperty("page");
    expect(client).toHaveProperty("list");
    expect(client).toHaveProperty("close");
    expect(client).toHaveProperty("disconnect");
    expect(client).toHaveProperty("getAISnapshot");
    expect(client).toHaveProperty("selectSnapshotRef");
    expect(client).toHaveProperty("getServerInfo");

    await client.disconnect();
  });

  test("getServerInfo returns correct info", async () => {
    const client = await connect(`http://127.0.0.1:${TEST_PORT}`);

    const info = await client.getServerInfo();

    expect(info).toHaveProperty("wsEndpoint");
    expect(info.wsEndpoint).toBe(`ws://127.0.0.1:${TEST_PORT}/cdp`);
    expect(info).toHaveProperty("extensionConnected", false);

    await client.disconnect();
  });

  test("list returns empty array when no pages", async () => {
    const client = await connect(`http://127.0.0.1:${TEST_PORT}`);

    const pages = await client.list();
    expect(pages).toEqual([]);

    await client.disconnect();
  });

  test("throws error when server is not available during operation", async () => {
    const client = await connect("http://127.0.0.1:19999");
    // connect() itself doesn't throw - it returns a client
    // But operations that require server connection will fail
    await expect(client.getServerInfo()).rejects.toThrow();
  });

  test("multiple clients can connect", async () => {
    const client1 = await connect(`http://127.0.0.1:${TEST_PORT}`);
    const client2 = await connect(`http://127.0.0.1:${TEST_PORT}`);

    const info1 = await client1.getServerInfo();
    const info2 = await client2.getServerInfo();

    expect(info1.wsEndpoint).toBe(info2.wsEndpoint);

    await client1.disconnect();
    await client2.disconnect();
  });
});

describe("Client - waitForPageLoad()", () => {
  test("returns result structure", async () => {
    // Create a mock page object
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({
        documentReadyState: "complete",
        documentLoading: false,
        pendingRequests: [],
      }),
    };

    const result = await waitForPageLoad(mockPage as any, { timeout: 1000 });

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("readyState");
    expect(result).toHaveProperty("pendingRequests");
    expect(result).toHaveProperty("waitTimeMs");
    expect(result).toHaveProperty("timedOut");
  });

  test("returns success when page is complete", async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({
        documentReadyState: "complete",
        documentLoading: false,
        pendingRequests: [],
      }),
    };

    const result = await waitForPageLoad(mockPage as any, {
      timeout: 1000,
      minimumWait: 0,
    });

    expect(result.success).toBe(true);
    expect(result.readyState).toBe("complete");
    expect(result.timedOut).toBe(false);
  });

  test("returns timeout when page never completes", async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({
        documentReadyState: "loading",
        documentLoading: true,
        pendingRequests: [{ url: "http://example.com/script.js", loadingDurationMs: 100, resourceType: "script" }],
      }),
    };

    const result = await waitForPageLoad(mockPage as any, {
      timeout: 200,
      minimumWait: 0,
      pollInterval: 50,
    });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.readyState).toBe("loading");
  });

  test("waits for network idle when enabled", async () => {
    let callCount = 0;
    const mockPage = {
      evaluate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            documentReadyState: "complete",
            documentLoading: false,
            pendingRequests: [{ url: "http://example.com/api", loadingDurationMs: 100, resourceType: "fetch" }],
          });
        }
        return Promise.resolve({
          documentReadyState: "complete",
          documentLoading: false,
          pendingRequests: [],
        });
      }),
    };

    const result = await waitForPageLoad(mockPage as any, {
      timeout: 5000,
      minimumWait: 0,
      pollInterval: 50,
      waitForNetworkIdle: true,
    });

    expect(result.success).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  test("skips network idle check when disabled", async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({
        documentReadyState: "complete",
        documentLoading: false,
        pendingRequests: [{ url: "http://example.com/api", loadingDurationMs: 100, resourceType: "fetch" }],
      }),
    };

    const result = await waitForPageLoad(mockPage as any, {
      timeout: 1000,
      minimumWait: 0,
      waitForNetworkIdle: false,
    });

    expect(result.success).toBe(true);
    expect(result.pendingRequests).toBe(1);
  });

  test("handles page.evaluate errors gracefully", async () => {
    let callCount = 0;
    const mockPage = {
      evaluate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error("Page navigating"));
        }
        return Promise.resolve({
          documentReadyState: "complete",
          documentLoading: false,
          pendingRequests: [],
        });
      }),
    };

    const result = await waitForPageLoad(mockPage as any, {
      timeout: 5000,
      minimumWait: 0,
      pollInterval: 50,
    });

    expect(result.success).toBe(true);
  });
});

describe("Client Types", () => {
  test("ServerInfo interface has correct shape", () => {
    const info: ServerInfo = {
      wsEndpoint: "ws://localhost:9222/cdp",
      extensionConnected: true,
    };

    expect(info.wsEndpoint).toBeDefined();
    expect(info.extensionConnected).toBeDefined();
  });

  test("WaitForPageLoadResult interface has correct shape", () => {
    const result: WaitForPageLoadResult = {
      success: true,
      readyState: "complete",
      pendingRequests: 0,
      waitTimeMs: 100,
      timedOut: false,
    };

    expect(result.success).toBe(true);
    expect(result.readyState).toBe("complete");
    expect(result.pendingRequests).toBe(0);
    expect(result.waitTimeMs).toBe(100);
    expect(result.timedOut).toBe(false);
  });
});
