# eBay Listing Automation

> **Parent:** `CLAUDE.md` → Skill Mode
> **Templates:** `specs/ebay-templates.md` (SEO, descriptions, compliance)
> **MCP Required:** mysql, playwright
> **Version:** v6 (enforced MCP-only, no code writing)

---

## ⛔ ABSOLUTE PROHIBITION - READ FIRST ⛔

### YOU MUST NOT:
```
❌ Write Python/JavaScript code files
❌ Create scripts (.py, .js, .sh, .bat)
❌ Use Write tool to create automation code
❌ Use Edit tool to create automation code
❌ Use Bash to run custom scripts
❌ Use browser_run_code (BANNED)
❌ Suggest "let me write a script..."
```

### YOU MUST:
```
✅ Use ONLY MCP tools listed at bottom of this file
✅ Execute browser actions via mcp__playwright__* tools
✅ Execute database queries via mcp__mysql__* tools
✅ Download images via Bash curl command ONLY
✅ Call MCP tools DIRECTLY - no wrapper code
```

### IF YOU CATCH YOURSELF:
- About to write `def ...` or `function ...` → STOP → Use MCP tool
- About to create a `.py` file → STOP → Use MCP tool
- About to use `browser_run_code` → STOP → Use `browser_click`, `browser_type`, etc.

---

## Invocation Rules

- Start workflow IMMEDIATELY when user runs `/process_ebay_listing`
- Process exactly 1 product and publish immediately
- Do NOT ask for confirmation or MySQL credentials
- Read `.mcp.json` for database config

---

## CRITICAL FIXES (v6)

### Fix 1: MCP TOOLS ONLY - NO CODE WRITING
**Problem:** Model writes Python/JS files instead of using MCP tools directly

**Rule:** NEVER write code files. Use MCP tools DIRECTLY:

| ❌ WRONG (Writing Code) | ✅ CORRECT (MCP Tool) |
|-------------------------|----------------------|
| `Write` a .py script | Call `mcp__mysql__mysql_query` directly |
| `Write` a .js automation | Call `mcp__playwright__browser_*` directly |
| `browser_run_code` with JS | Use `browser_click`, `browser_type`, etc. |
| `Bash` to run python script | Use MCP tools directly |

### Fix 2: NEVER Use browser_run_code
**Problem:** `setTimeout is not defined`, `window is not defined`, locator timeouts

**Rule:** Replace ALL browser_run_code with MCP tools:
| Instead of | Use |
|------------|-----|
| `setTimeout(fn, ms)` | `browser_wait_for time=N` (N in seconds) |
| `page.locator(...).click()` | `browser_click` with element ref |
| `element.fill(...)` | `browser_type` with element ref |
| `window.scrollTo(...)` | `browser_press_key key="End"` or `key="PageDown"` |
| `document.querySelector(...)` | `browser_snapshot` then use ref |

### Fix 3: Use Project Paths for Files
**Problem:** `ENOENT` or `File access denied` with Windows Temp paths

**Rule:** Use project-relative paths ONLY:
```
CORRECT: temp_images\image1.jpg (relative to project root)
CORRECT: C:\Users\zohof\Desktop\projects\gpm_controller\temp_images\image1.jpg (absolute)
WRONG: C:\Users\zohof\AppData\Local\Temp\... (system temp - blocked)
```

### Fix 4: Wait Before File Upload
**Problem:** `Modal state not present` when calling browser_file_upload

**Rule:** Always wait after clicking upload button:
```
1. Click "Add photos" button
2. browser_wait_for time=2
3. browser_snapshot to confirm modal/file chooser is open
4. THEN call browser_file_upload
```

### Fix 5: Fresh Snapshot Before Every Click
**Problem:** `Ref e44 not found` - using refs from old snapshots

**Rule:** Take snapshot IMMEDIATELY before each interaction:
```
snapshot → click → wait → snapshot → click → wait → snapshot → type
```
Never reuse refs across more than 1 tool call.

---

## Quick Reference

| Setting | Value |
|---------|-------|
| Price Rule | Original × 0.93 (7% discount) |
| Handling Time | 5 business days |
| Max Images | 25 (typically 9-12) |
| Image Upload | Project `temp_images/` folder |

---

## STEP 0: Prepare Images

### Download to Project Folder
```bash
# Create temp_images in PROJECT directory (not system temp)
mkdir temp_images 2>nul
del /q temp_images\* 2>nul

# Download each image
curl -o temp_images\image1.jpg "https://..."
curl -o temp_images\image2.jpg "https://..."

# Verify files exist
dir temp_images
```

**Path for browser_file_upload:**
```
C:\Users\zohof\Desktop\projects\gpm_controller\temp_images\image1.jpg
```

---

## STEP 1: Database Query

### 1.1 Connect to MySQL
```
1. Read .mcp.json → extract credentials
2. Call mcp__mysql__mysql_connect(host, port, user, password, database)
```

### 1.2 Get Best Product (Diversity Balanced)
```sql
WITH category_scores AS (
    SELECT
        pc.category_path,
        COUNT(DISTINCT CASE WHEN p.ebay_listed = 0 THEN p.id END) as unlisted_products,
        COUNT(DISTINCT CASE WHEN p.ebay_listed = 1 THEN p.id END) as listed_products
    FROM product_categories pc
    JOIN products p ON pc.product_id = p.id
    WHERE p.price IS NOT NULL AND p.price > 0
      AND (p.product_status = 'active' OR p.product_status IS NULL)
    GROUP BY pc.category_path
    HAVING unlisted_products >= 3 AND listed_products < 10
),
ranked_products AS (
    SELECT
        p.id as product_id, p.name, p.brand, p.price,
        COALESCE(pl.priority_score, 0) as priority_score,
        p.jsonld, p.sku,
        cs.listed_products,
        (COALESCE(pl.priority_score, 0) - (cs.listed_products * 10)) as diversity_score,
        ROW_NUMBER() OVER (PARTITION BY pc.category_path
            ORDER BY COALESCE(pl.priority_score, 0) DESC, p.price DESC) as category_rank
    FROM product_categories pc
    JOIN products p ON pc.product_id = p.id
    LEFT JOIN priority_listing pl ON p.id = pl.product_id
    JOIN category_scores cs ON pc.category_path = cs.category_path
    WHERE p.price IS NOT NULL AND p.price > 0 AND p.ebay_listed = 0
      AND (p.product_status = 'active' OR p.product_status IS NULL)
)
SELECT product_id, name, brand, price, priority_score, jsonld, sku
FROM ranked_products WHERE category_rank = 1
ORDER BY diversity_score DESC, priority_score DESC, price DESC
LIMIT 1
```

### 1.3 Get Images
```sql
SELECT url FROM product_images
WHERE product_id = {PRODUCT_ID} ORDER BY position ASC
```

### 1.4 Build SEO Title
Format: `{Brand} {Material} {Capacity} {Shape} {Product Type} {Color}`

---

## STEP 2: eBay Navigation

### 2.1 Navigate
```
mcp__playwright__browser_navigate → https://www.ebay.com/sl/prelist/suggest
```

### 2.2 Search Product
- Use SEO title (NOT MPN) for search

### 2.3 Handle Results
**Flow A:** Direct condition selection → Select "New" → "Continue to listing"
**Flow B:** Category selection → Select category → "New" → "Continue to listing"

---

## STEP 3: Upload Images (v5 Fix)

### Correct Upload Sequence
```
1. browser_wait_for time=2 (after page loads)
2. browser_snapshot → find "Add photos" button
3. browser_click → "Add photos" button
4. browser_wait_for time=2 (CRITICAL: wait for file chooser)
5. browser_snapshot → confirm modal state
6. browser_file_upload with paths array:
   ["C:\\Users\\zohof\\Desktop\\projects\\gpm_controller\\temp_images\\image1.jpg",
    "C:\\Users\\zohof\\Desktop\\projects\\gpm_controller\\temp_images\\image2.jpg"]
7. browser_wait_for time=3 (wait for upload)
8. browser_snapshot → verify "N/25" count
```

### If File Upload Fails
If `browser_file_upload` returns error:
1. Cancel with empty paths: `browser_file_upload paths=[]`
2. browser_wait_for time=1
3. browser_snapshot
4. Find "Upload from web" link
5. browser_click → "Upload from web"
6. browser_wait_for time=1
7. browser_snapshot → find URL input
8. browser_type → paste first image URL
9. browser_click → "Upload" button
10. Repeat for remaining images

---

## STEP 4: Apply Item Specifics

```
1. browser_snapshot
2. Click "Apply all" for suggested specifics
3. Clear inaccurate auto-fills (Making Method, Manufacturer Warranty)
```

### Dropdown Pattern (v5)
```
1. browser_snapshot → find dropdown button
2. browser_click → dropdown button
3. browser_wait_for time=1.5 (CRITICAL)
4. browser_snapshot → find options
5. browser_click → option
6. browser_press_key key="Escape"
```

---

## STEP 5: Fill Required Fields

### 5.1 Title
Use SEO title from STEP 1.4

### 5.2 Price (v5 - No browser_run_code)
```
price = original_price × 0.93

1. browser_snapshot → find price input
2. browser_click → price field (ref from snapshot)
3. browser_press_key key="Control+a"
4. browser_type → "65.09" (calculated price)
```

**NEVER use browser_run_code for price input.**

### 5.3 MPN
```
1. browser_snapshot → find MPN button/field
2. browser_click → MPN field (ref from THIS snapshot)
3. browser_wait_for time=1.5
4. browser_snapshot → find input
5. browser_type → MPN value
6. browser_press_key key="Enter"
7. browser_press_key key="Escape"
```

### 5.4 UPC/GTIN
Fill if available in JSONLD

---

## STEP 6: Write Description

> See `specs/ebay-templates.md` → Description Template & Product Features

**Required sections:**
- Product Details (Brand, MPN, Color, Material)
- Condition
- What You Will Receive
- Features (min 5-6 bullet points)
- Shipping & Returns
- Independent seller disclaimer

---

## STEP 7: Verify Shipping

Check "Handling time" shows "5 business days"

---

## STEP 8: Category-Specific Fields

**Cookware category:** Set "Stove Type Compatibility" → Gas, Induction, Electric

```
1. browser_snapshot → find "Stove Type Compatibility"
2. browser_click → button
3. browser_wait_for time=1.5
4. browser_snapshot → find checkboxes
5. browser_click → Gas
6. browser_click → Induction
7. browser_click → Electric
8. browser_press_key key="Escape"
```

---

## STEP 9: Publish

### Pre-Publish Checklist
- [ ] Images uploaded
- [ ] Price: 7% below original
- [ ] MPN filled + submitted
- [ ] Description with disclaimer
- [ ] Stove Type (if cookware)

### Publish
```
browser_snapshot → Click "List it" → Record eBay Item ID
```

---

## STEP 10: Update Database

```sql
UPDATE products
SET ebay_listed = 1,
    ebay_draft_id = '{EBAY_ITEM_ID}',
    ebay_listed_at = NOW()
WHERE id = {PRODUCT_ID}
```

---

## Error Handling (v5 Updated)

| Issue | Solution |
|-------|----------|
| setTimeout not defined | Use `browser_wait_for time=N` instead |
| window is not defined | Use MCP tools, not browser_run_code |
| locator.click timeout | Use `browser_click` with fresh snapshot ref |
| ENOENT (path not found) | Use project path `temp_images/`, not system Temp |
| File access denied | Use project-relative paths only |
| Modal state not present | Wait 2s after click, snapshot, then file_upload |
| Ref not found | Take fresh snapshot BEFORE each click/type |
| MPN not saving | Press Enter after typing |
| Stove Type missing | Click button, select options, press Escape |

---

## Timing Guidelines

| Action | Wait Time |
|--------|-----------|
| After page load | 2-3s |
| After clicking dropdown | 1.5s |
| After clicking upload button | 2s |
| Between form fields | 0.5-1s |
| After file upload | 3s per image |
| Before "List it" | 2s |

---

## Output Format

```
[START] eBay listing automation
[DB] Product ID: {ID} | Name: {NAME}
[DB] Price: ${ORIGINAL} -> ${EBAY_PRICE}
[IMAGES] Downloaded {N} images to temp_images/
[EBAY] Searched: {SEO_TITLE}
[EBAY] Uploaded {N} images
[EBAY] eBay Item ID: {ID}
[DB] Marked as listed
[END] Success
```

---

## MCP Tools (ONLY THESE - NO CODE FILES)

### ⚠️ REMINDER: Call these tools DIRECTLY. Do NOT write Python/JS wrapper code.

### MySQL (Call Directly)
```
mcp__mysql__mysql_connect     ← Call this, don't write a .py file
mcp__mysql__mysql_query       ← Call this, don't write a .py file
mcp__mysql__mysql_disconnect  ← Call this, don't write a .py file
```

### Playwright (Call Directly)
```
mcp__playwright__browser_navigate     ← Call this tool
mcp__playwright__browser_snapshot     ← Call this tool
mcp__playwright__browser_click        ← Call this tool
mcp__playwright__browser_type         ← Call this tool
mcp__playwright__browser_press_key    ← Call this tool
mcp__playwright__browser_file_upload  ← Call this tool
mcp__playwright__browser_wait_for     ← Call this tool
```

### Bash (ONLY for curl)
```
curl -o temp_images/image.jpg "URL"   ← ONLY allowed Bash usage
```

### ⛔ BANNED - NEVER USE
```
mcp__playwright__browser_run_code     ← BANNED
Write tool (for .py/.js files)        ← BANNED
Edit tool (for .py/.js files)         ← BANNED
Bash (for running scripts)            ← BANNED
```

---

## Example: WRONG vs RIGHT

### ❌ WRONG - Writing Code
```
"Let me write a Python script to automate this..."
[Uses Write tool to create ebay_listing.py]
[Uses Bash to run python ebay_listing.py]
```

### ✅ RIGHT - Using MCP Directly
```
[Calls mcp__mysql__mysql_connect]
[Calls mcp__mysql__mysql_query with SQL]
[Calls mcp__playwright__browser_navigate]
[Calls mcp__playwright__browser_snapshot]
[Calls mcp__playwright__browser_click]
...
```
