# dev-browser Skill

**Role**: Browser Automation Specialist - Execute browser interactions and web automation tasks using the dev-browser persistent browser automation tool.

**Context Auto-Load**:
- Load: `skills/dev-browser/SKILL.md`
- Load: `skills/dev-browser/src/types.ts` (for TypeScript definitions)
- Load: `skills/dev-browser/src/client.ts` (for main API)

## When to Use dev-browser

Use this skill when users ask to:
- Navigate websites and web applications
- Fill out and submit forms
- Click buttons and interact with page elements
- Take screenshots or capture page state
- Scrape or extract data from websites
- Test web functionality
- Automate browser workflows
- Log into websites or applications
- Wait for page elements to appear
- Test responsive design (different viewport sizes)

**Trigger phrases**: "go to", "navigate to", "click on", "fill out", "screenshot", "scrape", "automate", "test", "log into", "interact with"

## Workflow

### 1. Understand the Task
- What does the user want to accomplish?
- Is it a single action or a multi-step workflow?
- Do we need to inspect page structure first?

### 2. Initial Script
- Start with a simple script using the dev-browser client
- Navigate to the target URL
- Take a screenshot or get ARIA snapshot to see the current state
- Return observable output (current URL, page title, element count, etc.)

### 3. Evaluate Results
- Did the script run successfully?
- Can you see what the page currently shows?
- Are there any errors to debug?
- What's the next logical step?

### 4. Iterate
- Write focused scripts that do ONE thing at a time
- After each script, evaluate the output
- Continue until task is complete

## Script Execution Pattern

All scripts must run from `skills/dev-browser/`:

```bash
cd skills/dev-browser && node --import tsx/esm <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("descriptive-name");

// Perform actions
await page.goto("https://example.com");
// ... more code ...

await client.disconnect();
EOF
```

**Key Rules**:
- ✅ Use descriptive page names: `"github-login"`, `"checkout-cart"`, `"search-results"`
- ✅ Always call `await client.disconnect()` at the end
- ✅ Log/return state to confirm completion
- ✅ One script = ONE action or tightly related actions
- ✅ Pages persist between script executions - use this to your advantage
- ❌ Don't use TypeScript syntax in `page.evaluate()` callbacks (runs in browser)
- ❌ Don't create unnecessary files - use inline scripts with heredocs

## Common Patterns

### Navigate and Get Page Info
```typescript
const page = await client.page("example");
await page.goto("https://example.com");
console.log({ title: await page.title(), url: page.url() });
```

### Discover Elements with ARIA Snapshot
```typescript
const snapshot = await client.getAISnapshot("example");
console.log(snapshot); // Find element refs like [ref=e5]
```

### Click Element by Snapshot Ref
```typescript
const element = await client.selectSnapshotRef("example", "e5");
await element.click();
```

### Fill Form Fields
```typescript
await page.fill('input[name="username"]', "myusername");
await page.fill('input[type="password"]', "mypassword");
await page.click('button[type="submit"]');
```

### Wait for Elements
```typescript
await page.waitForSelector(".results");
await page.waitForURL("**/success");
```

### Take Screenshots
```typescript
await page.screenshot({ path: "tmp/screenshot.png" });
await page.screenshot({ path: "tmp/full.png", fullPage: true });
```

### Extract Data
```typescript
const data = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".item")).map(el => ({
    title: el.querySelector(".title")?.textContent,
    price: el.querySelector(".price")?.textContent,
  }));
});
console.log(data);
```

## Troubleshooting

### Script Failed or Page Didn't Load
1. Take a debug screenshot: `await page.screenshot({ path: "tmp/debug.png" })`
2. Check page state:
```typescript
console.log({
  url: page.url(),
  title: await page.title(),
  bodyText: await page.textContent("body").then(t => t?.slice(0, 500)),
});
```
3. Check if element exists: Use ARIA snapshot to find elements
4. Wait for navigation: Use `waitForPageLoad` or `waitForSelector`

### Can't Find Element
1. First try: Get ARIA snapshot and look for [ref=...] markers
2. Use `selectSnapshotRef()` to interact with snapshot elements
3. If that fails, inspect page source or take screenshot

### Browser Won't Launch
- Usually auto-launches on first `connect()`
- Check if port 9222 (devtools) is available
- Check `tmp/.browser-info.json` for connection details

## Important Notes

- **Viewport Sizes**: Specify viewport when creating page if needed: `client.page("name", { viewport: { width: 1920, height: 1080 } })`
- **Headless Mode**: Set `HEADLESS=true` environment variable to run without GUI
- **Page Persistence**: Pages stay alive across script executions - reuse page names
- **Browser Persistence**: Browser process keeps running after `disconnect()` - good for iterative tasks
- **TypeScript Only at Top Level**: Browser context (`page.evaluate()`) runs plain JavaScript

## When to Write to Files

Only write scripts to `tmp/` directory when:
- The script is complex (>30 lines)
- It needs to be reused across multiple tasks
- The user explicitly requests it
- It's part of an automation suite

Otherwise, use inline heredoc scripts.

## Next Steps After Success

1. **Verify completion**: Screenshot or final state check
2. **Clean up**: Close unused pages if task spawned many
3. **Document results**: Provide user with final output/screenshots
4. **Suggest improvements**: Could this task be automated for future runs?
