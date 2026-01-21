---
name: dev-browser
description: Browser automation with persistent page state. Use when users ask to navigate websites, fill forms, take screenshots, extract web data, test web apps, or automate browser workflows. Trigger phrases include "go to [url]", "click on", "fill out the form", "take a screenshot", "scrape", "automate", "test the website", "log into", or any browser interaction request.
---

# Dev Browser Skill

Browser automation that maintains page state across script executions. Write small, focused scripts to accomplish tasks incrementally. Once you've proven out part of a workflow and there is repeated work to be done, you can write a script to do the repeated work in a single execution.

## Choosing Your Approach

- **Local/source-available sites**: Read the source code first to write selectors directly
- **Unknown page layouts**: Use `getAISnapshot()` to discover elements and `selectSnapshotRef()` to interact with them
- **Visual feedback**: Take screenshots to see what the user sees

## Setup

The browser launches automatically when you run a script - no server setup required.

```bash
cd skills/dev-browser && npm install
```

**Important**: You create named pages using `client.page("name")`. Pages persist between script executions.

Set `HEADLESS=true` environment variable to run browser in headless mode.

## Writing Scripts

> **Run all scripts from `skills/dev-browser/` directory.** The `@/` import alias requires this directory's config.

Execute scripts inline using heredocs:

```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
// Create page with custom viewport size (optional)
const page = await client.page("example", { viewport: { width: 1920, height: 1080 } });

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
```

Or using npm script:
```bash
cd skills/dev-browser && npm run dev <<'EOF'
# ... your TypeScript code here ...
EOF
```

**Write to `tmp/` files only when** the script needs reuse, is complex, or user explicitly requests it.

### Key Principles

1. **Small scripts**: Each script does ONE thing (navigate, click, fill, check)
2. **Evaluate state**: Log/return state at the end to decide next steps
3. **Descriptive page names**: Use `"checkout"`, `"login"`, not `"main"`
4. **Disconnect to exit**: `await client.disconnect()` - pages persist for next script
5. **Plain JS in evaluate**: `page.evaluate()` runs in browser - no TypeScript syntax

## Workflow Loop

Follow this pattern for complex tasks:

1. **Write a script** to perform one action
2. **Run it** and observe the output
3. **Evaluate** - did it work? What's the current state?
4. **Decide** - is the task complete or do we need another script?
5. **Repeat** until task is done

### No TypeScript in Browser Context

Code passed to `page.evaluate()` runs in the browser, which doesn't understand TypeScript:

```typescript
// Correct: plain JavaScript
const text = await page.evaluate(() => {
  return document.body.innerText;
});

// Wrong: TypeScript syntax will fail at runtime
const text = await page.evaluate(() => {
  const el: HTMLElement = document.body; // Type annotation breaks in browser!
  return el.innerText;
});
```

## Scraping Data

For scraping large datasets, intercept and replay network requests rather than scrolling the DOM. See [references/scraping.md](references/scraping.md) for the complete guide covering request capture, schema discovery, and paginated API replay.

## Client API

```typescript
const client = await connect();

// Get or create named page (viewport only applies to new pages)
const page = await client.page("name");
const pageWithSize = await client.page("name", { viewport: { width: 1920, height: 1080 } });

const pages = await client.list(); // List all page names
await client.close("name"); // Close a page
await client.disconnect(); // Disconnect (browser keeps running for next script)

// ARIA Snapshot methods
const snapshot = await client.getAISnapshot("name"); // Get accessibility tree
const element = await client.selectSnapshotRef("name", "e5"); // Get element by ref
```

The `page` object is a standard Playwright Page.

## Waiting

```typescript
import { waitForPageLoad } from "@/client.js";

await waitForPageLoad(page); // After navigation
await page.waitForSelector(".results"); // For specific elements
await page.waitForURL("**/success"); // For specific URL
```

## Inspecting Page State

### Screenshots

**Simple and optimized:**
```typescript
import { screenshot } from "@/client.js";

// JPEG Q60 - 105ms, 39KB - optimized for speed and quality
await screenshot(page, "tmp/screenshot.jpeg");
```

**For different page load strategies:**
```typescript
// Fast page load - loads initial content quickly
await page.goto("https://example.com", { waitUntil: "load" }); // 276ms
await screenshot(page, "tmp/screenshot.jpeg");

// Safe page load - waits for most DOM rendering
await page.goto("https://example.com", { waitUntil: "domcontentloaded" }); // 976ms
await screenshot(page, "tmp/screenshot.jpeg");

// ⚠️ Avoid networkidle - too slow (1525ms)
```

**Performance (GitHub.com):**
- Navigation with "load": 276ms (✅ recommended)
- Screenshot: 105ms, 39KB
- **Total: 381ms** (vs 1297ms with old config)

### ARIA Snapshot (Element Discovery)

Use `getAISnapshot()` to discover page elements. Returns YAML-formatted accessibility tree:

```yaml
- banner:
  - link "Hacker News" [ref=e1]
  - navigation:
    - link "new" [ref=e2]
- main:
  - list:
    - listitem:
      - link "Article Title" [ref=e8]
      - link "328 comments" [ref=e9]
- contentinfo:
  - textbox [ref=e10]
    - /placeholder: "Search"
```

**Interpreting refs:**

- `[ref=eN]` - Element reference for interaction (visible, clickable elements only)
- `[checked]`, `[disabled]`, `[expanded]` - Element states
- `[level=N]` - Heading level
- `/url:`, `/placeholder:` - Element properties

**Interacting with refs:**

```typescript
const snapshot = await client.getAISnapshot("hackernews");
console.log(snapshot); // Find the ref you need

const element = await client.selectSnapshotRef("hackernews", "e2");
await element.click();
```

## Real-World Examples

### YouTube - Search and Play a Song
```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect, screenshot } from "@/client.js";

const client = await connect();
const page = await client.page("youtube");

// Navigate to YouTube
await page.goto("https://www.youtube.com", { waitUntil: "load" });

// Search for a song
await page.fill('input[name="search_query"]', "lofi hip hop");
await page.press('input[name="search_query"]', "Enter");
await page.waitForLoadState("networkidle");

// Click on first video result
await page.waitForSelector("ytd-video-renderer a#thumbnail", { timeout: 10000 });
await page.click("ytd-video-renderer a#thumbnail");
await page.waitForLoadState("load");

// Wait for video to start playing
await page.waitForTimeout(3000);

const title = await page.title();
console.log(`🎵 Now playing: ${title}`);
await screenshot(page, "tmp/youtube-playing.jpeg");

await client.disconnect();
EOF
```

### Google Search
```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect, screenshot } from "@/client.js";

const client = await connect();
const page = await client.page("google");

await page.goto("https://www.google.com", { waitUntil: "load" });
await page.fill('textarea[name="q"]', "weather today");
await page.press('textarea[name="q"]', "Enter");
await page.waitForLoadState("networkidle");

await screenshot(page, "tmp/google-results.jpeg");
console.log("Search complete!");

await client.disconnect();
EOF
```

### Login to a Website
```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect, screenshot } from "@/client.js";

const client = await connect();
const page = await client.page("login");

await page.goto("https://example.com/login", { waitUntil: "load" });

// Fill login form
await page.fill('input[name="email"]', "user@example.com");
await page.fill('input[name="password"]', "password123");
await page.click('button[type="submit"]');

// Wait for redirect after login
await page.waitForURL("**/dashboard", { timeout: 10000 });

console.log("Logged in successfully!");
await screenshot(page, "tmp/dashboard.jpeg");

await client.disconnect();
EOF
```

### Click a Button by Text
```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("example");

await page.goto("https://example.com", { waitUntil: "load" });

// Click button by text content
await page.click('button:has-text("Submit")');
// Or use getByRole
await page.getByRole("button", { name: "Submit" }).click();

await client.disconnect();
EOF
```

### Extract Data from Page
```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("scrape");

await page.goto("https://news.ycombinator.com", { waitUntil: "load" });

// Extract all headlines
const headlines = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".titleline a")).map(el => ({
    title: el.textContent,
    url: el.href
  }));
});

console.log("Top Headlines:");
headlines.slice(0, 5).forEach((h, i) => console.log(`${i+1}. ${h.title}`));

await client.disconnect();
EOF
```

## Error Recovery

Page state persists after failures. Debug with:

```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("debug");

await page.screenshot({ path: "tmp/debug.png" });
console.log({
  url: page.url(),
  title: await page.title(),
  bodyText: await page.textContent("body").then((t) => t?.slice(0, 200)),
});

await client.disconnect();
EOF
```
