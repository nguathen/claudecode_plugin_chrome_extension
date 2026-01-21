import { describe, test, expect, vi } from "vitest";
import { waitForPageLoad } from "../client";
import type { WaitForPageLoadResult } from "../client";

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
