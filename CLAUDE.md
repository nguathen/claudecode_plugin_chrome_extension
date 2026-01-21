# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

Always use Node.js/npm instead of Bun.

```bash
# Install dependencies (from skills/dev-browser/ directory)
cd skills/dev-browser && npm install

# Run tests (uses vitest)
cd skills/dev-browser && npm test

# Run TypeScript check
cd skills/dev-browser && npx tsc --noEmit
```

## Important: Before Completing Code Changes

**Always run these checks before considering a task complete:**

1. **TypeScript check**: `npx tsc --noEmit` - Ensure no type errors
2. **Tests**: `npm test` - Ensure all tests pass

Common TypeScript issues in this codebase:

- Use `import type { ... }` for type-only imports (required by `verbatimModuleSyntax`)
- Browser globals (`document`, `window`) in `page.evaluate()` callbacks need `declare const document: any;` since DOM lib is not included

## Project Architecture

### Overview

This is a browser automation tool designed for developers and AI agents. It solves the problem of maintaining browser state across multiple script executions - unlike Playwright scripts that start fresh each time, dev-browser keeps pages alive and reusable.

### Structure

All source code lives in `skills/dev-browser/`:

- `src/client.ts` - Client: launches browser automatically, manages named pages
- `src/types.ts` - Shared TypeScript types
- `src/snapshot/` - ARIA snapshot utilities for LLM-friendly page inspection
- `tmp/` - Directory for temporary automation scripts

### Path Aliases

The project uses `@/` as a path alias to `./src/`. This is configured in both `package.json` (via `imports`) and `tsconfig.json` (via `paths`).

```typescript
// Import from src/client.ts
import { connect } from "@/client.js";
```

### How It Works

1. **Client** (`connect()` in `src/client.ts`):
   - Automatically launches browser if not already running
   - Saves browser connection info to `tmp/.browser-info.json` for reconnection
   - Manages named pages that persist across script executions
   - Returns standard Playwright `Page` objects for automation

### Usage Pattern

```typescript
import { connect } from "@/client.js";

const client = await connect(); // Launches browser automatically
const page = await client.page("my-page"); // Gets existing or creates new
await page.goto("https://example.com");
// Page persists for future scripts
await client.disconnect(); // Disconnects but browser keeps running
```

## Node.js Guidelines

- Use `npx tsx` for running TypeScript files
- Use `dotenv` or similar if you need to load `.env` files
- Use `node:fs` for file system operations
