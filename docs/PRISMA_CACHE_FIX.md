# Prisma Module Cache Issue & Fix

**Date:** January 3, 2026 @ 2:45PM
**Branch**: `feat/conform-01+02-unified`

**Issue:** E2E test failures with `@prisma/client did not initialize yet` despite running `prisma generate`  
**Root Cause:** Node.js module caching with auto-startup architecture  
**Status:** FIXED ✓

---

## Problem Summary

When running E2E tests in a devcontainer with **auto-startup** (frontend + backend start automatically at session launch):

1. Backend server starts before `prisma generate` is run
2. Node.js module loader tries to `require("@prisma/client")` → fails, caches failure
3. You run `npx prisma generate` → generates `/node_modules/@prisma/client` ✓
4. But the **running server process** still has the stale "failed" entry in its module cache
5. E2E test hits server → `getPrisma()` returns cached error
6. **Result:** `@prisma/client did not initialize yet` error even though it was generated

The **health check script passed** because it ran in a **fresh process** with clean module cache.

---

## Solution Implemented

### 1. **Enhanced Error Caching in resultDb.js**

Changed Prisma initialization to cache errors and fail fast:

```javascript
// Before: Could retry and fail repeatedly during request handling
function getPrisma() {
  if (prisma) return prisma;
  const { PrismaClient } = require("@prisma/client"); // ← Could fail here
  prisma = new PrismaClient();
  return prisma;
}

// After: Caches error, fails immediately on all attempts
let prismaInitializationError = null;

function getPrisma() {
  if (prismaInitializationError) {
    throw prismaInitializationError; // ← Fail fast
  }
  if (prisma) return prisma;
  try {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
    return prisma;
  } catch (error) {
    prismaInitializationError = new Error(
      `Prisma initialization failed: ${error.message}\n` +
        'Make sure to run "npx prisma generate" and restart the server.\n' +
        "If you just ran prisma generate, the running server process has a stale module cache."
    );
    throw prismaInitializationError;
  }
}
```

**Benefit:** Errors are caught at the first attempt, with a clear message about the solution.

### 2. **Eager Validation at Server Startup**

Added Prisma validation in `server/index.js` startup sequence:

```javascript
// 1.a PRISMA VALIDATION: Ensure @prisma/client is available
try {
  const { getPrisma } = require("./utils/resultDb");
  getPrisma(); // Eagerly test Prisma initialization
  console.log("[Prisma] Client available and initialized successfully");
} catch (prismaErr) {
  console.error(
    "[Prisma] INITIALIZATION FAILED - Server startup blocked:",
    prismaErr.message
  );
  console.error(
    "[Prisma] RECOVERY: Run `npx --prefix server prisma generate` and restart the server"
  );
  throw prismaErr;
}
```

**Benefit:** Server fails fast at startup if Prisma isn't available, with clear recovery instructions.

### 3. **Convenience NPM Script**

Added `npm run prisma:regen` to `server/package.json`:

```json
"prisma:regen": "npx prisma generate && npm run prisma:restart",
"prisma:restart": "pkill -f 'node.*index.js' || true"
```

**Usage:**

```bash
cd server
npm run prisma:regen
```

This runs `prisma generate` and then kills the old server process so nodemon/auto-restart picks up the fresh process.

---

## What to Do If This Happens Again

### Scenario 1: During Development

**If you see the error during a test run:**

```bash
cd server
npm run prisma:regen
# Wait for server to auto-restart (via nodemon)
# Run your test again
```

### Scenario 2: After Environment Changes

If you pull changes that affect Prisma schema:

```bash
cd server
npm run prisma:regen
```

### Scenario 3: Manual Recovery

If for any reason you need to restart the server manually:

```bash
# Kill all node processes (be careful in multi-project setups)
pkill -f 'node.*index.js'

# Server will restart automatically (devcontainer postAttachCommand handles this)
# Or manually start: npm run dev --prefix server
```

---

## Architecture Notes

### Why This Happens with Auto-Startup

The devcontainer.json has:

```jsonc
"postCreateCommand": "... npx prisma generate ... && npm install -g concurrently",
"postAttachCommand": {
  "client + server": "concurrently 'cd ./client && npm run dev' 'cd ./server && npm run dev'"
}
```

**Timeline:**

- `postCreateCommand` runs once → generates Prisma in a fresh process ✓
- `postAttachCommand` starts server → loads Prisma successfully ✓
- User runs `npx prisma generate` later during development → updates disk files
- But running server has stale module cache → still sees "not found"
- **Solution:** Restart the server process to clear its module cache

### Better Alternatives (Future Consideration)

1. **Use a module cache invalidation library** - Clear require cache after prisma generate
2. **Implement hot-reload for Prisma client** - Detect schema changes and reload
3. **Use lazy-loading with file watchers** - Watch for new `@prisma/client` and reload when detected
4. **Use `nodemon` with Prisma schema watching** - Automatically restart server when schema changes

For now, the `npm run prisma:regen` script is the simplest solution.

---

## Testing the Fix

To verify the fix is working:

1. **Make sure server is running:**

   ```bash
   npm run dev --prefix server
   # Should see: [Prisma] Client available and initialized successfully
   ```

2. **If you see Prisma error at startup:**

   ```bash
   npm run prisma:regen --prefix server
   # This will generate and restart
   ```

3. **Run E2E test:**
   ```bash
   npm run e2e:smoke --prefix client
   ```

---

## Related Files

- [resultDb.js](../../server/utils/resultDb.js) - Prisma initialization
- [index.js](../../server/index.js) - Server startup with Prisma validation
- [package.json](../../server/package.json) - New npm scripts
- [devcontainer.json](../../.devcontainer/devcontainer.json) - Auto-startup configuration

---

**Status:** FIXED - Startup now validates Prisma availability and provides clear recovery instructions.
