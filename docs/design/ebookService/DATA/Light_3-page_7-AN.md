# Analysis: Early Completion Screen Issue

**Date**: January 5, 2026 @ 12:25PM
**Branch**: `feat/adaptive-polling`

**Issue**: Frontend shows completed content screen immediately after Generate button click, before job actually completes

---

## Problem Statement

User clicks "Generate" → immediately receives a "completed" screen with export button → button does nothing because backend job is still running.

Expected behavior: Screen should show **POLLING state** with progress tracking while job executes (75+ seconds), then transition to **RESULT_READY** when complete.

---

## Root Cause: Field Name Mismatch

**Location**: [client/src/lib/stores/flowStore.js](../../../../../client/src/lib/stores/flowStore.js#L181)

The `updateProgress()` method expected field name `percent`:

```javascript
currentProgressPercent: progressData.percent ?? store.currentProgressPercent,
```

But polling code in [GenerateFlow.svelte](../../../../../client/src/components/GenerateFlow.svelte#L281) sends `progress_percent`:

```javascript
flowStore.updateProgress({
  progress_percent: status.progress_percent || 0, // ← underscore, not camelCase
  eta: status.eta,
  calls_completed: status.calls_completed,
  calls_total: status.calls_total,
});
```

---

## Impact Chain

1. ✅ User clicks Generate → 202 response with `resultId`
2. ✅ Frontend transitions to `POLLING` state
3. ✅ `PollingStatus.svelte` component renders (waiting for progress updates)
4. ❌ First status poll arrives, but `currentProgressPercent` stays `0` (field mismatch)
5. ❌ `currentEta` never updates
6. ❌ Progress bar frozen at 0%, appears stuck
7. ❌ User perceives job as "complete" or broken

---

## Why It Wasn't Caught

- **updateProgress** was added for polling but field names weren't aligned
- Component had all the right pieces (POLLING state, PollingStatus.svelte, adaptive polling)
- But the **data flow** was broken at the store level

---

## Verification Points

**Server side** (from Light_3-page_7.md log):

- ✅ Job executes correctly: 75,109ms total
- ✅ SmartPoller tracks status properly
- ✅ Status endpoint returns correct fields: `eta`, `calls_completed`, `calls_total`, `progress_percent`

**Client side** (broken):

- ❌ `flowStore.updateProgress()` ignores `progress_percent` field
- ❌ PollingStatus component has no data to display
- ❌ User sees frozen progress screen

---

## Solution Category

**Simple field name fix** - align data contract between polling code and store method.
