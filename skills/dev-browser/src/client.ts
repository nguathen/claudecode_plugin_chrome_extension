import { chromium, type Browser, type Page, type ElementHandle, type BrowserContext } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ViewportSize } from "./types";
import { getSnapshotScript } from "./snapshot/browser-script";

// File to store browser connection info
const BROWSER_INFO_FILE = path.join(process.cwd(), "tmp", ".browser-info.json");
// File to store named pages info for persistence across scripts
const PAGES_INFO_FILE = path.join(process.cwd(), "tmp", ".pages-info.json");

interface BrowserInfo {
  wsEndpoint: string;
  pid: number;
}

interface NamedPageInfo {
  name: string;
  url: string;
}

/**
 * Options for waiting for page load
 */
export interface WaitForPageLoadOptions {
  /** Maximum time to wait in ms (default: 10000) */
  timeout?: number;
  /** How often to check page state in ms (default: 50) */
  pollInterval?: number;
  /** Minimum time to wait even if page appears ready in ms (default: 100) */
  minimumWait?: number;
  /** Wait for network to be idle (no pending requests) (default: true) */
  waitForNetworkIdle?: boolean;
}

/**
 * Result of waiting for page load
 */
export interface WaitForPageLoadResult {
  /** Whether the page is considered loaded */
  success: boolean;
  /** Document ready state when finished */
  readyState: string;
  /** Number of pending network requests when finished */
  pendingRequests: number;
  /** Time spent waiting in ms */
  waitTimeMs: number;
  /** Whether timeout was reached */
  timedOut: boolean;
}

interface PageLoadState {
  documentReadyState: string;
  documentLoading: boolean;
  pendingRequests: PendingRequest[];
}

interface PendingRequest {
  url: string;
  loadingDurationMs: number;
  resourceType: string;
}

/**
 * Wait for a page to finish loading using document.readyState and performance API.
 *
 * Uses browser-use's approach of:
 * - Checking document.readyState for 'complete'
 * - Monitoring pending network requests via Performance API
 * - Filtering out ads, tracking, and non-critical resources
 * - Graceful timeout handling (continues even if timeout reached)
 */
export async function waitForPageLoad(
  page: Page,
  options: WaitForPageLoadOptions = {}
): Promise<WaitForPageLoadResult> {
  const {
    timeout = 10000,
    pollInterval = 50,
    minimumWait = 100,
    waitForNetworkIdle = true,
  } = options;

  const startTime = Date.now();
  let lastState: PageLoadState | null = null;

  // Wait minimum time first
  if (minimumWait > 0) {
    await new Promise((resolve) => setTimeout(resolve, minimumWait));
  }

  // Poll until ready or timeout
  while (Date.now() - startTime < timeout) {
    try {
      lastState = await getPageLoadState(page);

      // Check if document is complete
      const documentReady = lastState.documentReadyState === "complete";

      // Check if network is idle (no pending critical requests)
      const networkIdle = !waitForNetworkIdle || lastState.pendingRequests.length === 0;

      if (documentReady && networkIdle) {
        return {
          success: true,
          readyState: lastState.documentReadyState,
          pendingRequests: lastState.pendingRequests.length,
          waitTimeMs: Date.now() - startTime,
          timedOut: false,
        };
      }
    } catch {
      // Page may be navigating, continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached - return current state
  return {
    success: false,
    readyState: lastState?.documentReadyState ?? "unknown",
    pendingRequests: lastState?.pendingRequests.length ?? 0,
    waitTimeMs: Date.now() - startTime,
    timedOut: true,
  };
}

/**
 * Get the current page load state including document ready state and pending requests.
 * Filters out ads, tracking, and non-critical resources that shouldn't block loading.
 */
async function getPageLoadState(page: Page): Promise<PageLoadState> {
  const result = await page.evaluate(() => {
    // Access browser globals via globalThis for TypeScript compatibility
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = globalThis as { document?: any; performance?: any };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const perf = g.performance!;
    const doc = g.document!;

    const now = perf.now();
    const resources = perf.getEntriesByType("resource");
    const pending: Array<{ url: string; loadingDurationMs: number; resourceType: string }> = [];

    // Common ad/tracking domains and patterns to filter out
    const adPatterns = [
      "doubleclick.net",
      "googlesyndication.com",
      "googletagmanager.com",
      "google-analytics.com",
      "facebook.net",
      "connect.facebook.net",
      "analytics",
      "ads",
      "tracking",
      "pixel",
      "hotjar.com",
      "clarity.ms",
      "mixpanel.com",
      "segment.com",
      "newrelic.com",
      "nr-data.net",
      "/tracker/",
      "/collector/",
      "/beacon/",
      "/telemetry/",
      "/log/",
      "/events/",
      "/track.",
      "/metrics/",
    ];

    // Non-critical resource types
    const nonCriticalTypes = ["img", "image", "icon", "font"];

    for (const entry of resources) {
      // Resources with responseEnd === 0 are still loading
      if (entry.responseEnd === 0) {
        const url = entry.name;

        // Filter out ads and tracking
        const isAd = adPatterns.some((pattern) => url.includes(pattern));
        if (isAd) continue;

        // Filter out data: URLs and very long URLs
        if (url.startsWith("data:") || url.length > 500) continue;

        const loadingDuration = now - entry.startTime;

        // Skip requests loading > 10 seconds (likely stuck/polling)
        if (loadingDuration > 10000) continue;

        const resourceType = entry.initiatorType || "unknown";

        // Filter out non-critical resources loading > 3 seconds
        if (nonCriticalTypes.includes(resourceType) && loadingDuration > 3000) continue;

        // Filter out image URLs even if type is unknown
        const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|$)/i.test(url);
        if (isImageUrl && loadingDuration > 3000) continue;

        pending.push({
          url,
          loadingDurationMs: Math.round(loadingDuration),
          resourceType,
        });
      }
    }

    return {
      documentReadyState: doc.readyState,
      documentLoading: doc.readyState !== "complete",
      pendingRequests: pending,
    };
  });

  return result;
}

/**
 * Optimized screenshot - JPEG Q60 (105ms, 39KB)
 * Best balance of speed and file size
 * Recommended for all use cases
 */
export async function screenshot(page: Page, path: string): Promise<void> {
  await page.screenshot({
    path,
    type: "jpeg",
    quality: 60,
  });
}

/**
 * Options for creating or getting a page
 */
export interface PageOptions {
  /** Viewport size for new pages */
  viewport?: ViewportSize;
}

export interface DevBrowserClient {
  page: (name: string, options?: PageOptions) => Promise<Page>;
  list: () => Promise<string[]>;
  close: (name: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /**
   * Get AI-friendly ARIA snapshot for a page.
   * Returns YAML format with refs like [ref=e1], [ref=e2].
   * Refs are stored on window.__devBrowserRefs for cross-connection persistence.
   */
  getAISnapshot: (name: string) => Promise<string>;
  /**
   * Get an element handle by its ref from the last getAISnapshot call.
   * Refs persist across Playwright connections.
   */
  selectSnapshotRef: (name: string, ref: string) => Promise<ElementHandle | null>;
}

/**
 * Ensure tmp directory exists
 */
function ensureTmpDir(): void {
  const tmpDir = path.dirname(BROWSER_INFO_FILE);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
}

/**
 * Save browser info to file
 */
function saveBrowserInfo(info: BrowserInfo): void {
  ensureTmpDir();
  fs.writeFileSync(BROWSER_INFO_FILE, JSON.stringify(info, null, 2));
}

/**
 * Load browser info from file
 */
function loadBrowserInfo(): BrowserInfo | null {
  try {
    if (fs.existsSync(BROWSER_INFO_FILE)) {
      const data = fs.readFileSync(BROWSER_INFO_FILE, "utf-8");
      return JSON.parse(data) as BrowserInfo;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return null;
}

/**
 * Save pages info to file for persistence across scripts
 */
function savePagesInfo(pages: Map<string, NamedPageInfo>): void {
  ensureTmpDir();
  const data = Object.fromEntries(pages);
  fs.writeFileSync(PAGES_INFO_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load pages info from file
 */
function loadPagesInfo(): Map<string, NamedPageInfo> {
  try {
    if (fs.existsSync(PAGES_INFO_FILE)) {
      const data = fs.readFileSync(PAGES_INFO_FILE, "utf-8");
      const obj = JSON.parse(data) as Record<string, NamedPageInfo>;
      return new Map(Object.entries(obj));
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return new Map();
}

/**
 * Try to connect to an existing browser
 */
async function tryConnectExisting(info: BrowserInfo): Promise<Browser | null> {
  // First try the stored endpoint
  try {
    const browser = await chromium.connectOverCDP(info.wsEndpoint, {
      timeout: 3000,
    });
    return browser;
  } catch {
    // Stored endpoint failed, try to fetch fresh URL from CDP
  }

  // Try to get fresh WebSocket URL from CDP endpoint
  try {
    const wsEndpoint = await getCDPWebSocketUrl(9222);
    const browser = await chromium.connectOverCDP(wsEndpoint, {
      timeout: 3000,
    });
    // Update stored info with new endpoint
    saveBrowserInfo({ wsEndpoint, pid: 9222 });
    return browser;
  } catch {
    return null;
  }
}

/**
 * Get the WebSocket debugger URL from CDP endpoint
 */
async function getCDPWebSocketUrl(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  const data = await response.json() as { webSocketDebuggerUrl: string };
  return data.webSocketDebuggerUrl;
}

/**
 * Launch browser with CDP endpoint exposed
 * Uses fixed port 9222 to enable reconnection
 */
async function launchBrowserWithCDP(headless: boolean): Promise<{ browser: Browser; wsEndpoint: string }> {
  // Use fixed port for CDP so we can reliably reconnect
  // If port 9222 is in use, it will throw error and previous browser should be killed first
  const port = 9222;

  const browser = await chromium.launch({
    headless,
    args: [
      `--remote-debugging-port=${port}`,
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  // Get the actual WebSocket URL from CDP
  const wsEndpoint = await getCDPWebSocketUrl(port);

  // Save browser info for reconnection
  saveBrowserInfo({ wsEndpoint, pid: port });

  console.log(`[dev-browser] Browser launched on port ${port}`);

  return { browser, wsEndpoint };
}

/**
 * Connect to dev-browser. Automatically launches browser if not running.
 */
export async function connect(): Promise<DevBrowserClient> {
  const headless = process.env.HEADLESS === "true";
  let browser: Browser;
  let context: BrowserContext;
  let connectedViaCDP = false;

  // Named pages tracking (name -> page URL for matching)
  // Load from file for persistence across scripts
  let namedPages = new Map<string, NamedPageInfo>();

  // Try to connect to existing browser
  const existingInfo = loadBrowserInfo();
  if (existingInfo) {
    const existingBrowser = await tryConnectExisting(existingInfo);
    if (existingBrowser) {
      console.log("[dev-browser] Connected to existing browser");
      browser = existingBrowser;
      connectedViaCDP = true;
      // Load persisted page names
      namedPages = loadPagesInfo();
      context = browser.contexts()[0] || await browser.newContext();
    } else {
      // Browser no longer running, launch new one
      console.log("[dev-browser] Previous browser not available, launching new one...");
      const result = await launchBrowserWithCDP(headless);
      browser = result.browser;
      context = browser.contexts()[0] || await browser.newContext();
    }
  } else {
    // No existing browser, launch new one
    console.log("[dev-browser] Launching browser...");
    const result = await launchBrowserWithCDP(headless);
    browser = result.browser;
    context = browser.contexts()[0] || await browser.newContext();
  }

  // Helper to find page by name
  async function findPageByName(name: string): Promise<Page | null> {
    const pageInfo = namedPages.get(name);
    if (!pageInfo) return null;

    // Find page by URL match
    const pages = context.pages();
    for (const page of pages) {
      if (page.url() === pageInfo.url) {
        return page;
      }
    }

    // URL might have changed, try to find by checking page still exists
    return null;
  }

  // Track which pages have listeners to avoid duplicates
  const pagesWithListeners = new WeakSet<Page>();

  // Get or create a page by name
  async function getPage(name: string, options?: PageOptions): Promise<Page> {
    // Check if we already have this named page
    let page = await findPageByName(name);

    if (!page) {
      // Check all existing pages - maybe it's a new page we haven't named yet
      const pages = context.pages();
      if (pages.length > 0 && namedPages.size === 0) {
        // First connection, use existing page if available
        page = pages[0]!;
      } else {
        // Create new page
        page = await context.newPage();
      }

      // Set viewport if specified
      if (options?.viewport) {
        await page.setViewportSize(options.viewport);
      }
    }

    // Track page URL changes - only add listener once per page
    if (!pagesWithListeners.has(page)) {
      page.on("framenavigated", (frame) => {
        if (frame === page!.mainFrame()) {
          namedPages.set(name, { name, url: page!.url() });
          savePagesInfo(namedPages);
        }
      });
      pagesWithListeners.add(page);
    }

    // Register the named page and persist
    namedPages.set(name, { name, url: page.url() });
    savePagesInfo(namedPages);

    return page;
  }

  return {
    page: getPage,

    async list(): Promise<string[]> {
      return Array.from(namedPages.keys());
    },

    async close(name: string): Promise<void> {
      try {
        const page = await findPageByName(name);
        if (page) {
          await page.close();
        }
      } finally {
        // Always clean up tracking, even if close fails
        namedPages.delete(name);
        savePagesInfo(namedPages);
      }
    },

    async disconnect(): Promise<void> {
      // Release connection so Node.js can exit
      // Browser keeps running in background for next script
      if (connectedViaCDP) {
        // CDP connection: browser.close() just disconnects, doesn't close browser
        await browser.close();
      } else {
        // Direct launch: force exit to keep browser running
        process.exit(0);
      }
    },

    async getAISnapshot(name: string): Promise<string> {
      const page = await getPage(name);

      // Inject the snapshot script and call getAISnapshot
      const snapshotScript = getSnapshotScript();
      const snapshot = await page.evaluate((script: string) => {
        // Inject script if not already present
        // Note: page.evaluate runs in browser context where window exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        if (!w.__devBrowser_getAISnapshot) {
          // eslint-disable-next-line no-eval
          eval(script);
        }
        return w.__devBrowser_getAISnapshot();
      }, snapshotScript);

      return snapshot;
    },

    async selectSnapshotRef(name: string, ref: string): Promise<ElementHandle | null> {
      const page = await getPage(name);

      // Find the element using the stored refs
      const elementHandle = await page.evaluateHandle((refId: string) => {
        // Note: page.evaluateHandle runs in browser context where globalThis is the window
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = globalThis as any;
        const refs = w.__devBrowserRefs;
        if (!refs) {
          throw new Error("No snapshot refs found. Call getAISnapshot first.");
        }
        const element = refs[refId];
        if (!element) {
          throw new Error(
            `Ref "${refId}" not found. Available refs: ${Object.keys(refs).join(", ")}`
          );
        }
        return element;
      }, ref);

      // Check if we got an element
      const element = elementHandle.asElement();
      if (!element) {
        await elementHandle.dispose();
        return null;
      }

      return element;
    },
  };
}
