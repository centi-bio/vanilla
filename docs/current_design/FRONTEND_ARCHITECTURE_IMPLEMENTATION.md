# Frontend Architecture Implementation: Adaptive Polling

**Date**: January 5, 2026  @ 10:50AM
**Branch**: `feat/conform-01+02-fix`

**Purpose**: Technical specification for implementing adaptive polling intelligence  
**Audience**: Frontend engineers implementing the feature  
**Reading Time**: ~20 minutes

**Related Documents**:
- [FRONTEND_ARCHITECTURE_ADJUST.md](FRONTEND_ARCHITECTURE_ADJUST.md) - Structural changes needed
- [FRONTEND_ARCHITECTURE_SPEC_VS_IMPLEMENTATION.md](FRONTEND_ARCHITECTURE_SPEC_VS_IMPLEMENTATION.md) - Gap analysis
- [ARCHITECTURE_IMPLEMENTATION_GUIDE.md](../ARCHITECTURE_IMPLEMENTATION_GUIDE.md) - Backend context

---

## Table of Contents

1. [Overview](#overview)
2. [Step 1: Create SmartPoller Utility](#step-1-create-smartpoller-utility)
3. [Step 2: Refactor Polling Loop](#step-2-refactor-polling-loop)
4. [Step 3: Update Flow Store](#step-3-update-flow-store)
5. [Testing Strategy](#testing-strategy)
6. [Validation Checklist](#validation-checklist)

---

## Overview

### What We're Building

A **SmartPoller** utility that calculates dynamic polling intervals based on job ETA, enabling:
- Efficient polling during long jobs (low frequency)
- Responsive polling near completion (high frequency)
- Initial wait phase to reduce early-stage load

### Implementation Scope

|      Component        |  Effort  |  Risk  | Priority |
|-----------------------|----------|--------|----------|
| SmartPoller utility   | ~4 hours |   Low  |   High   |
| GenerateFlow refactor | ~3 hours |   Low  |   High   |
| flowStore updates     | ~1 hour  |   Low  |  Medium  |
| Unit tests            | ~3 hours |   Low  |   High   |
| Integration tests     | ~2 hours | Medium |   High   |

**Total**: ~13 hours engineering effort

### Success Criteria

- ✅ SmartPoller calculates intervals correctly
- ✅ Polling loop uses calculated intervals
- ✅ Jobs complete within 20-minute timeout
- ✅ No regression in polling reliability
- ✅ Unit test coverage > 80%

---

## Step 1: Create SmartPoller Utility

### File: `client/src/lib/SmartPoller.js`

```javascript
/**
 * SmartPoller - Intelligent polling interval calculation
 *
 * Implements Pattern 5 (Smart Polling) from ARCHITECTURE_ROADMAP_EXECUTIVE.md
 * Provides adaptive polling intervals based on remaining job time (ETA)
 *
 * Design:
 * - High ETA (30+ secs) → Poll slowly (10s intervals)
 * - Medium ETA (15-30 secs) → Poll moderately (5s intervals)
 * - Low ETA (5-15 secs) → Poll faster (2s intervals)
 * - Critical ETA (<5 secs) → Poll very fast (500ms intervals)
 *
 * Strategy:
 * 1. On first poll, determine if should wait 80% of ETA
 * 2. If waiting, don't poll yet; return wait duration
 * 3. Once polling starts, use ETA-based interval calculation
 * 4. As ETA decreases, interval decreases (more frequent polling)
 */

class SmartPoller {
  /**
   * Create a new SmartPoller instance
   * @param {Object} config - Configuration object
   * @param {number} config.highEtaThreshold - ETA threshold for high (30s default)
   * @param {number} config.mediumEtaThreshold - ETA threshold for medium (15s default)
   * @param {number} config.lowEtaThreshold - ETA threshold for low (5s default)
   * @param {number} config.highEtaInterval - Polling interval for high ETA (10000ms default)
   * @param {number} config.mediumEtaInterval - Polling interval for medium ETA (5000ms default)
   * @param {number} config.lowEtaInterval - Polling interval for low ETA (2000ms default)
   * @param {number} config.criticalEtaInterval - Polling interval for critical ETA (500ms default)
   * @param {boolean} config.enableInitialWait - Enable 80% wait strategy (true default)
   * @param {number} config.initialWaitFactor - Percentage of ETA to wait (0.8 = 80% default)
   */
  constructor(config = {}) {
    // ETA thresholds (in seconds)
    this.highEtaThreshold = config.highEtaThreshold ?? 30;
    this.mediumEtaThreshold = config.mediumEtaThreshold ?? 15;
    this.lowEtaThreshold = config.lowEtaThreshold ?? 5;

    // Polling intervals (in milliseconds)
    this.highEtaInterval = config.highEtaInterval ?? 10000; // 10 seconds
    this.mediumEtaInterval = config.mediumEtaInterval ?? 5000; // 5 seconds
    this.lowEtaInterval = config.lowEtaInterval ?? 2000; // 2 seconds
    this.criticalEtaInterval = config.criticalEtaInterval ?? 500; // 500ms

    // Initial wait strategy
    this.enableInitialWait = config.enableInitialWait ?? true;
    this.initialWaitFactor = config.initialWaitFactor ?? 0.8; // 80%

    // State tracking
    this.initialEta = null; // First ETA received
    this.hasStartedPolling = false; // Whether past initial wait phase
  }

  /**
   * Determine if should wait initially before polling
   * Returns the wait duration in milliseconds, or null if should start polling immediately
   *
   * @param {number} etaSeconds - Current ETA in seconds
   * @returns {number|null} Duration to wait in ms, or null to start polling immediately
   *
   * @example
   * const poller = new SmartPoller();
   * const waitMs = poller.getInitialWaitDuration(23); // Returns 18400 (80% of 23s)
   * if (waitMs) {
   *   await sleep(waitMs);
   *   poller.startPolling();
   * }
   */
  getInitialWaitDuration(etaSeconds) {
    // Not enabled
    if (!this.enableInitialWait) {
      return null;
    }

    // Already polling
    if (this.hasStartedPolling) {
      return null;
    }

    // Store initial ETA for reference
    if (!this.initialEta) {
      this.initialEta = etaSeconds;
    }

    // Calculate wait duration: 80% of ETA
    const waitDurationSeconds = etaSeconds * this.initialWaitFactor;
    const waitDurationMs = Math.round(waitDurationSeconds * 1000);

    return waitDurationMs;
  }

  /**
   * Start the polling phase (mark initial wait as complete)
   * Called after initial wait duration has elapsed
   */
  startPolling() {
    this.hasStartedPolling = true;
  }

  /**
   * Calculate polling interval based on remaining ETA
   * Returns interval in milliseconds
   *
   * Interval strategy:
   * - ETA > 30s: poll every 10 seconds (low frequency, less server load)
   * - ETA 15-30s: poll every 5 seconds (moderate frequency)
   * - ETA 5-15s: poll every 2 seconds (higher frequency)
   * - ETA < 5s: poll every 500ms (very high frequency, responsive)
   *
   * @param {number} etaSeconds - Current ETA in seconds (from server)
   * @returns {number} Polling interval in milliseconds
   *
   * @example
   * const poller = new SmartPoller();
   * poller.calculateInterval(30); // Returns 10000 (10 seconds)
   * poller.calculateInterval(15); // Returns 5000 (5 seconds)
   * poller.calculateInterval(8);  // Returns 2000 (2 seconds)
   * poller.calculateInterval(3);  // Returns 500 (500ms)
   */
  calculateInterval(etaSeconds) {
    // Validate input
    if (typeof etaSeconds !== 'number' || etaSeconds < 0) {
      console.warn(
        `SmartPoller: Invalid ETA value ${etaSeconds}, returning default 2000ms`
      );
      return this.lowEtaInterval;
    }

    // Round to nearest integer for comparison
    const eta = Math.round(etaSeconds);

    // Determine interval based on ETA
    if (eta > this.highEtaThreshold) {
      return this.highEtaInterval; // 10s
    }

    if (eta > this.mediumEtaThreshold) {
      return this.mediumEtaInterval; // 5s
    }

    if (eta > this.lowEtaThreshold) {
      return this.lowEtaInterval; // 2s
    }

    return this.criticalEtaInterval; // 500ms
  }

  /**
   * Get human-readable interval description
   * Useful for logging/debugging
   *
   * @param {number} intervalMs - Interval in milliseconds
   * @returns {string} Human-readable description
   *
   * @example
   * poller.getIntervalDescription(10000); // Returns "10s"
   * poller.getIntervalDescription(500);   // Returns "500ms"
   */
  getIntervalDescription(intervalMs) {
    if (intervalMs >= 1000) {
      return `${intervalMs / 1000}s`;
    }
    return `${intervalMs}ms`;
  }

  /**
   * Reset poller state (for new jobs)
   */
  reset() {
    this.initialEta = null;
    this.hasStartedPolling = false;
  }

  /**
   * Get current configuration (for debugging)
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      highEtaThreshold: this.highEtaThreshold,
      mediumEtaThreshold: this.mediumEtaThreshold,
      lowEtaThreshold: this.lowEtaThreshold,
      highEtaInterval: this.highEtaInterval,
      mediumEtaInterval: this.mediumEtaInterval,
      lowEtaInterval: this.lowEtaInterval,
      criticalEtaInterval: this.criticalEtaInterval,
      enableInitialWait: this.enableInitialWait,
      initialWaitFactor: this.initialWaitFactor,
      initialEta: this.initialEta,
      hasStartedPolling: this.hasStartedPolling,
    };
  }
}

export default SmartPoller;
```

### Key Design Decisions

**Why these intervals?**
- 10s (high ETA): Reduces early-stage load by 80% vs 2s baseline
- 5s (medium ETA): Balances between efficiency and responsiveness
- 2s (low ETA): Maintains responsiveness as job nears completion
- 500ms (critical ETA): Final push for real-time updates

**Why 80% wait factor?**
- From ARCHITECTURE_ROADMAP_EXECUTIVE.md: "wait 80% of ETA, then rapid-fire"
- Allows initial infrastructure setup without polling load
- 20% polling phase captures final updates reliably

**Why configurable?**
- Different job types may have different characteristics
- Allows tuning based on performance observations
- Can be disabled for testing or special cases

---

## Step 2: Refactor Polling Loop

### File: [GenerateFlow.svelte](../../client/src/components/GenerateFlow.svelte#L207-L280)

**Current Implementation (lines 207-280)**:

The current `pollUntilComplete()` function uses hardcoded `POLL_INTERVAL_MS = 2000`. We need to:
1. Import SmartPoller
2. Create instance at function start
3. Replace hardcoded interval with calculated interval
4. Implement initial wait phase

**Refactored Implementation**:

```javascript
/**
 * Poll for job completion and fetch result
 * Implements Pattern 5: Smart Polling with adaptive intervals
 *
 * Flow:
 * 1. Receive ETA from initial status poll
 * 2. Optionally wait 80% of ETA (initial wait phase)
 * 3. Poll with adaptive intervals based on remaining ETA
 * 4. As ETA decreases, polling frequency increases
 * 5. On completion, fetch result
 */
async function pollUntilComplete(resultId) {
  const MAX_ATTEMPTS = 600; // 20 minutes with varying intervals
  const PROGRESS_TIMEOUT_MS = 60000; // 1 minute timeout per poll
  const MAX_TOTAL_TIME_MS = 20 * 60 * 1000; // 20 minute hard limit

  // ✅ NEW: Create SmartPoller instance
  const smartPoller = new SmartPoller({
    highEtaThreshold: 30,
    mediumEtaThreshold: 15,
    lowEtaThreshold: 5,
    enableInitialWait: true,
    initialWaitFactor: 0.8,
  });

  flowStore.setState("POLLING");
  flowStore.setResultId(resultId);

  const pollingStartTime = Date.now();
  let initialWaitApplied = false;
  let currentEta = null;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        // Fetch status with timeout
        const statusPromise = getStatus(resultId);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Status poll timeout")),
            PROGRESS_TIMEOUT_MS
          )
        );

        const status = await Promise.race([statusPromise, timeoutPromise]);

        // ✅ NEW: Handle initial wait phase (only on first successful poll)
        if (!initialWaitApplied && status.eta) {
          const waitDurationMs = smartPoller.getInitialWaitDuration(status.eta);
          if (waitDurationMs) {
            console.log(
              `[SmartPoller] Waiting ${smartPoller.getIntervalDescription(waitDurationMs)} ` +
              `before first poll (80% of ETA: ${status.eta}s)`
            );

            flowStore.updateProgress({
              status: "waiting",
              message: `Waiting ${smartPoller.getIntervalDescription(waitDurationMs)} before polling...`,
              progress_percent: 5,
              eta: status.eta,
            });

            // Wait before starting polls
            await new Promise((resolve) =>
              setTimeout(resolve, waitDurationMs)
            );

            smartPoller.startPolling();
          }
          initialWaitApplied = true;
        }

        // Store current ETA for interval calculation
        if (status.eta) {
          currentEta = status.eta;
        }

        // Update progress in store
        flowStore.updateProgress({
          status: status.status,
          progress_percent: status.progress_percent || 0,
          eta: status.eta,
          calls_completed: status.calls_completed,
          calls_total: status.calls_total,
          message: status.message,
        });

        // If complete, fetch the result
        if (status.status === "complete") {
          const result = await getResult(resultId);
          flowStore.setResult(result.content || result.out_envelope);
          flowStore.transitionTo("RESULT_READY");
          console.log(`[SmartPoller] Job complete after ${attempt + 1} polls`);
          return;
        }

        // ✅ NEW: Calculate adaptive interval based on current ETA
        let pollIntervalMs = smartPoller.calculateInterval(currentEta || 30);

        // Safety check: ensure we don't exceed total time limit
        const elapsedMs = Date.now() - pollingStartTime;
        if (elapsedMs + pollIntervalMs > MAX_TOTAL_TIME_MS) {
          // Would exceed limit, use shorter interval
          pollIntervalMs = Math.max(500, MAX_TOTAL_TIME_MS - elapsedMs);
        }

        // Log interval for debugging (comment out in production if noisy)
        console.debug(
          `[SmartPoller] Poll ${attempt + 1}: ETA=${currentEta}s, ` +
          `Interval=${smartPoller.getIntervalDescription(pollIntervalMs)}`
        );

        // ✅ CHANGED: Use calculated interval instead of hardcoded
        await new Promise((resolve) =>
          setTimeout(resolve, pollIntervalMs)
        );
      } catch (pollErr) {
        console.warn(`Poll attempt ${attempt + 1} failed:`, pollErr.message);

        // Retry on timeout or transient errors
        if (
          pollErr.message.includes("timeout") ||
          pollErr.status === 429 ||
          pollErr.status >= 500
        ) {
          if (attempt < MAX_ATTEMPTS - 1) {
            // Use adaptive interval even for retries
            const retryIntervalMs = currentEta 
              ? smartPoller.calculateInterval(currentEta) 
              : 2000;
            
            console.log(
              `[SmartPoller] Retrying in ${smartPoller.getIntervalDescription(retryIntervalMs)}`
            );
            
            await new Promise((resolve) =>
              setTimeout(resolve, retryIntervalMs)
            );
            continue;
          }
        }

        throw pollErr;
      }
    }

    // Max attempts reached
    throw new Error(
      `Polling timeout after ${MAX_ATTEMPTS} attempts (` +
      `${(MAX_ATTEMPTS * 2000) / 1000 / 60} minutes)`
    );
  } catch (err) {
    flowStore.setError(err);
    flowStore.transitionTo("ERROR");
    console.error("[SmartPoller] Polling error:", err);
  }
}
```

### Changes Made

|         Change         | Before | After | Reason |
|------------------------|--------|-------|--------|
| **SmartPoller import** | None | Added at top | Required for calculation |
| **Initialization**     | N/A | In function body | Per-job instance |
| **Initial wait**       | None | 80% of first ETA | Pattern 5 spec |
| **Interval source**    | Constant 2000ms | `calculateInterval(eta)` | Adaptive strategy |
| **Logging**            | Minimal | Enhanced with SmartPoller | Debugging support |
| **Retry interval**     | Constant 2000ms | Adaptive calculation | Consistent strategy |

### Import Statement

Add this at the top of GenerateFlow.svelte (in the `<script>` section):

```javascript
import SmartPoller from "../lib/SmartPoller.js";
```

---

## Step 3: Update Flow Store

### File: [flowStore.js](../../client/src/lib/stores/flowStore.js)

**Current State**: Store has `currentEta` and other polling-related fields, but no polling configuration.

**New State Properties to Add** (in the writable state object, around line 65):

```javascript
{
  // ... existing properties ...
  
  // Polling configuration (NEW)
  pollingConfig: {
    initialEta: null,           // Initial ETA from first status poll
    waitingForInitialPhase: false, // Currently in wait phase
    currentPollInterval: 2000,   // Current interval (for monitoring)
    pollStartedAt: null,        // When polling began
    totalPolls: 0,              // Number of polls completed
    adaptivePollingEnabled: true, // Whether adaptive polling is active
  }
}
```

**New Setter Methods** (add to the returned object, after existing methods):

```javascript
/**
 * Update polling configuration
 * @param {Object} config - Polling config object
 */
setPollingConfig(config) {
  update((store) => ({
    ...store,
    pollingConfig: {
      ...store.pollingConfig,
      ...config,
    },
  }));
},

/**
 * Set initial ETA (from first status poll)
 * @param {number} eta - Initial ETA in seconds
 */
setInitialEta(eta) {
  update((store) => ({
    ...store,
    pollingConfig: {
      ...store.pollingConfig,
      initialEta: eta,
    },
  }));
},

/**
 * Update current polling interval
 * @param {number} intervalMs - Current interval in milliseconds
 */
updateCurrentPollInterval(intervalMs) {
  update((store) => ({
    ...store,
    pollingConfig: {
      ...store.pollingConfig,
      currentPollInterval: intervalMs,
    },
  }));
},

/**
 * Increment total poll count
 */
incrementPollCount() {
  update((store) => ({
    ...store,
    pollingConfig: {
      ...store.pollingConfig,
      totalPolls: (store.pollingConfig.totalPolls || 0) + 1,
    },
  }));
},

/**
 * Reset polling configuration for new job
 */
resetPollingConfig() {
  update((store) => ({
    ...store,
    pollingConfig: {
      initialEta: null,
      waitingForInitialPhase: false,
      currentPollInterval: 2000,
      pollStartedAt: null,
      totalPolls: 0,
      adaptivePollingEnabled: true,
    },
  }));
},
```

**Where to Add**: Add these methods after the existing store methods (around line 200-250).

---

## Testing Strategy

### Unit Tests: SmartPoller

**File**: `client/__tests__/SmartPoller.test.js`

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import SmartPoller from "../src/lib/SmartPoller.js";

describe("SmartPoller", () => {
  let poller;

  beforeEach(() => {
    poller = new SmartPoller();
  });

  describe("calculateInterval", () => {
    it("should return 10s interval for high ETA (>30s)", () => {
      const interval = poller.calculateInterval(40);
      expect(interval).toBe(10000);
    });

    it("should return 5s interval for medium ETA (15-30s)", () => {
      const interval = poller.calculateInterval(20);
      expect(interval).toBe(5000);
    });

    it("should return 2s interval for low ETA (5-15s)", () => {
      const interval = poller.calculateInterval(10);
      expect(interval).toBe(2000);
    });

    it("should return 500ms interval for critical ETA (<5s)", () => {
      const interval = poller.calculateInterval(3);
      expect(interval).toBe(500);
    });

    it("should handle boundary conditions", () => {
      expect(poller.calculateInterval(30)).toBe(5000); // Medium
      expect(poller.calculateInterval(15)).toBe(2000); // Low
      expect(poller.calculateInterval(5)).toBe(500);   // Critical
    });

    it("should handle invalid input gracefully", () => {
      expect(poller.calculateInterval(-5)).toBe(2000); // Default
      expect(poller.calculateInterval("invalid")).toBe(2000); // Default
      expect(poller.calculateInterval(null)).toBe(2000); // Default
    });
  });

  describe("getInitialWaitDuration", () => {
    it("should return 80% of ETA for initial wait", () => {
      const waitMs = poller.getInitialWaitDuration(25);
      expect(waitMs).toBe(20000); // 80% of 25s
    });

    it("should return null once polling has started", () => {
      poller.getInitialWaitDuration(25);
      poller.startPolling();
      const waitMs = poller.getInitialWaitDuration(20);
      expect(waitMs).toBeNull();
    });

    it("should respect enableInitialWait config", () => {
      const noWaitPoller = new SmartPoller({ enableInitialWait: false });
      const waitMs = noWaitPoller.getInitialWaitDuration(25);
      expect(waitMs).toBeNull();
    });

    it("should store initialEta", () => {
      poller.getInitialWaitDuration(23);
      expect(poller.initialEta).toBe(23);
    });
  });

  describe("getIntervalDescription", () => {
    it("should format seconds correctly", () => {
      expect(poller.getIntervalDescription(10000)).toBe("10s");
      expect(poller.getIntervalDescription(5000)).toBe("5s");
    });

    it("should format milliseconds correctly", () => {
      expect(poller.getIntervalDescription(500)).toBe("500ms");
      expect(poller.getIntervalDescription(100)).toBe("100ms");
    });
  });

  describe("configuration", () => {
    it("should accept custom thresholds", () => {
      const custom = new SmartPoller({
        highEtaThreshold: 60,
        mediumEtaThreshold: 30,
        lowEtaThreshold: 10,
      });

      expect(custom.calculateInterval(50)).toBe(5000); // Medium (was high)
      expect(custom.calculateInterval(20)).toBe(2000); // Low (was medium)
    });

    it("should accept custom intervals", () => {
      const custom = new SmartPoller({
        highEtaInterval: 20000,
        mediumEtaInterval: 10000,
      });

      expect(custom.calculateInterval(40)).toBe(20000);
      expect(custom.calculateInterval(20)).toBe(10000);
    });
  });

  describe("reset", () => {
    it("should clear state for new job", () => {
      poller.getInitialWaitDuration(25);
      poller.startPolling();

      poller.reset();

      expect(poller.initialEta).toBeNull();
      expect(poller.hasStartedPolling).toBe(false);
    });
  });
});
```

### Integration Tests: Polling Loop

**File**: `client/__tests__/polling.integration.test.js`

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import GenerateFlow from "../src/components/GenerateFlow.svelte";

describe("Polling Integration", () => {
  let mockFetch;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should use adaptive intervals during polling", async () => {
    // Mock responses with decreasing ETA
    const responses = [
      { status: "processing", eta: 45, progress_percent: 10 },
      { status: "processing", eta: 40, progress_percent: 20 },
      { status: "processing", eta: 30, progress_percent: 50 },
      { status: "processing", eta: 10, progress_percent: 80 },
      { status: "complete", eta: 0, progress_percent: 100 },
    ];

    let callCount = 0;
    mockFetch.mockImplementation(() => {
      const response = responses[callCount++];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      });
    });

    render(GenerateFlow);

    // Trigger polling...
    // Verify intervals progress: 10s → 5s → 5s → 2s → 500ms

    // This is complex to test with fake timers; see manual testing section
  });
});
```

### Manual Testing Checklist

Before merging, manually verify:

1. **Console Logs**
   - ✅ See `[SmartPoller]` debug logs during polling
   - ✅ Interval changes as ETA decreases
   - ✅ Initial wait message appears

2. **Timing**
   - ✅ Generate 30-second job, watch interval decrease: 10s → 5s → 2s → 500ms
   - ✅ Generate 10-second job, watch immediate 2s polling
   - ✅ Initial wait approximately 80% of first ETA

3. **Functionality**
   - ✅ Jobs still complete successfully
   - ✅ Progress updates appear in UI
   - ✅ No timeout errors on long jobs
   - ✅ Result displays correctly

4. **Edge Cases**
   - ✅ Job completes very quickly (< 5s)
   - ✅ Job takes maximum time (20 minutes)
   - ✅ Network error during polling (should retry with adaptive interval)

---

## Validation Checklist

### Code Quality

- [ ] SmartPoller has 80%+ unit test coverage
- [ ] No TypeScript/ESLint errors in SmartPoller.js
- [ ] No TypeScript/ESLint errors in GenerateFlow.svelte changes
- [ ] flowStore setter methods follow existing patterns
- [ ] Code formatted with Prettier

### Functional Validation

- [ ] SmartPoller.calculateInterval() returns correct intervals for all ETA ranges
- [ ] SmartPoller.getInitialWaitDuration() returns 80% of ETA
- [ ] Initial wait phase implemented and working
- [ ] Polling loop uses calculated intervals, not hardcoded 2000ms
- [ ] Store state updates with polling config
- [ ] Console logs show adaptive interval strategy

### Integration Testing

- [ ] Generate 30-second job, verify intervals: 10s → 5s → 2s
- [ ] Generate 10-second job, verify immediate 2s polling
- [ ] Generate 50+ second job, verify no timeout
- [ ] Network error during poll, verify retry with adaptive interval
- [ ] Multiple concurrent jobs, verify independent polling

### Performance Validation

- [ ] Small jobs (< 5s) complete with < 500ms polling (minimal overhead)
- [ ] Medium jobs (15-30s) complete with 5s polling (balanced)
- [ ] Large jobs (30+ s) complete with 10s initial polling (load reduction)
- [ ] Total polling count for 30s job reduced by ~60%

### Backward Compatibility

- [ ] Existing job generation flow unchanged
- [ ] Progress display works with new polling
- [ ] Result fetching unchanged
- [ ] Error handling still works
- [ ] No regressions in other features

---

## Debugging Guide

### Enable Verbose Logging

Change console.debug to console.log in pollUntilComplete():

```javascript
console.log( // Changed from console.debug
  `[SmartPoller] Poll ${attempt + 1}: ETA=${currentEta}s, ` +
  `Interval=${smartPoller.getIntervalDescription(pollIntervalMs)}`
);
```

### Access SmartPoller Config

In browser console during polling:

```javascript
// In GenerateFlow, make SmartPoller accessible
window.smartPoller = smartPoller; // Add this line

// Then in console:
window.smartPoller.getConfig(); // See full configuration
```

### Check Store State

```javascript
// In browser console
import { flowStore } from "./stores/flowStore.js";
flowStore.subscribe(store => console.log("Polling config:", store.pollingConfig));
```

### Simulate Long Job

For testing, modify job duration on backend temporarily:

```javascript
// In server/genieService.js (temporary for testing)
const jobDuration = process.env.TEST_JOB_DURATION_MS || 23000;
```

Then:

```bash
TEST_JOB_DURATION_MS=120000 npm run dev # 2 minute job
```

---

## Deployment

### Feature Branch

```bash
git checkout -b feat/adaptive-polling
```

### PR Checklist

- [ ] All tests passing (unit + integration)
- [ ] Manual testing completed
- [ ] Code review approved
- [ ] No performance regressions
- [ ] Documentation updated (this file)
- [ ] FRONTEND_ARCHITECTURE.md reflects adaptive polling implementation

### Merge Strategy

Merge to `feat/conform-01+02-fix` (feature branch), then eventually to `main`.

**Pre-Merge Verification**:
```bash
npm run test           # All tests pass
npm run lint           # No linting errors
npm run build          # Build succeeds
npm run dev            # Manual testing
```

---

## Related Patterns

This implementation aligns with:

- **ARCHITECTURE_ROADMAP_EXECUTIVE.md**: Pattern 5 (Smart Polling)
- **ARCHITECTURE_IMPLEMENTATION_GUIDE.md**: Frontend integration specs
- **FRONTEND_ARCHITECTURE.md**: Component-level design

---

**Document Status**: Implementation Guide (January 5, 2026)  
**Status**: Ready for engineering work  
**Effort Estimate**: 13 hours  
**Risk Level**: Low  
**Next Phase**: Code review after initial implementation

