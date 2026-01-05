# Frontend Architecture Adjustment: Implementing Adaptive Polling

**Date**: January 5, 2026 @ 10:45AM
**Branch**: `feat/conform-01+02-fix`

**Purpose**: Define required code structure changes to implement adaptive polling intelligence  
**Audience**: Technical leads, architects, and implementers  
**Reading Time**: ~10 minutes

**Related Documents**:

- [FRONTEND_ARCHITECTURE_COMPLIANCE.md](FRONTEND_ARCHITECTURE_COMPLIANCE.md) - Identified the gap
- [FRONTEND_ARCHITECTURE_SPEC_VS_IMPLEMENTATION.md](FRONTEND_ARCHITECTURE_SPEC_VS_IMPLEMENTATION.md) - Analyzed root cause
- [FRONTEND_ARCHITECTURE_IMPLEMENTATION.md](FRONTEND_ARCHITECTURE_IMPLEMENTATION.md) - Technical implementation specs

---

## Executive Summary

The current frontend polling implementation uses a **hardcoded 2-second interval** regardless of remaining job time. To align with architectural specifications, we must introduce **dynamic interval adjustment** based on estimated time remaining (ETA).

**Changes Required**: 3 structural modifications across 2 files

| Component                | Change                | Complexity | Impact                |
| ------------------------ | --------------------- | ---------- | --------------------- |
| **Smart Poller Utility** | Create new module     | Medium     | Core intelligence     |
| **GenerateFlow.svelte**  | Refactor polling loop | Medium     | Uses new utility      |
| **flowStore.js**         | Add polling config    | Low        | Configuration storage |

---

## Current State Analysis

### Code Location: [GenerateFlow.svelte](../../client/src/components/GenerateFlow.svelte#L207-L280)

**Current Polling Implementation** (lines 207-280):

```javascript
async function pollUntilComplete(resultId) {
  const MAX_ATTEMPTS = 600;         // 20 minutes total
  const POLL_INTERVAL_MS = 2000;    // ❌ HARDCODED - NEVER CHANGES
  const PROGRESS_TIMEOUT_MS = 60000;

  flowStore.setState("POLLING");
  flowStore.setResultId(resultId);

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const status = await getStatus(resultId);

        flowStore.updateProgress({...status data...});

        if (status.status === "complete") {
          const result = await getResult(resultId);
          flowStore.setResult(result);
          flowStore.transitionTo("RESULT_READY");
          return;
        }

        // ❌ FIXED INTERVAL - no ETA awareness
        await new Promise((resolve) =>
          setTimeout(resolve, POLL_INTERVAL_MS)
        );
      } catch (pollErr) { ... }
    }
  } catch (err) { ... }
}
```

**Problems with Current Design**:

1. **No ETA awareness** - Doesn't use `status.eta` value returned from server
2. **No interval calculation** - POLL_INTERVAL_MS is constant throughout
3. **No strategy** - Doesn't implement 80% wait, rapid-fire final 20% concept
4. **No SmartPoller** - Logic is inline; can't be tested independently
5. **Scalability impact** - Can't support efficient polling for many concurrent jobs

---

## Design Adjustment: Three-Component Solution

### 1. Create SmartPoller Utility Class

**File**: `client/src/lib/SmartPoller.js` (NEW)

**Purpose**: Encapsulate intelligent polling interval logic

**Responsibilities**:

- Calculate polling interval based on ETA
- Manage polling strategy state (initial wait phase vs. rapid-fire phase)
- Provide testable interval calculation
- Allow configuration (thresholds, intervals)

**Public Interface**:

```javascript
class SmartPoller {
  constructor(config = {}) {
    // Initialize with configurable thresholds
  }

  calculateInterval(remainingSeconds) {
    // Return polling interval based on ETA
  }

  shouldWaitInitially(initialEta) {
    // Return true if should wait 80% of initial ETA
  }
}
```

**Design Rationale**: Separates polling intelligence from component logic, enabling:

- Independent unit testing of interval calculation
- Configuration management (thresholds, intervals)
- Reusable across multiple components if needed
- Easier to debug interval logic

### 2. Refactor Polling Loop in GenerateFlow.svelte

**File**: [GenerateFlow.svelte](../../client/src/components/GenerateFlow.svelte#L207-L280)

**Changes**:

- Import SmartPoller from utility module
- Create SmartPoller instance at function start
- Replace hardcoded POLL_INTERVAL_MS with dynamic calculation
- Calculate interval after each status update based on new ETA
- Implement initial wait phase (80% of ETA) before rapid polling

**New Flow**:

```
Initial request returns ETA (e.g., 23 seconds)
  ↓
SmartPoller.shouldWaitInitially(23) → true
  ↓
Wait 18.4 seconds (80% of 23s)
  ↓
Start polling with adaptive intervals:
  - if eta > 30: poll every 10s
  - if eta 15-30: poll every 5s
  - if eta 5-15: poll every 2s
  - if eta < 5: poll every 500ms
  ↓
Poll until complete
```

**Key Refactoring Pattern**:

- Move SmartPoller instantiation outside loop
- After each status update, call SmartPoller.calculateInterval(status.eta)
- Use returned interval instead of constant POLL_INTERVAL_MS

### 3. Store Polling Configuration in flowStore

**File**: [flowStore.js](../../client/src/lib/stores/flowStore.js)

**Changes**:

- Add polling configuration object to store state
- Add setter method for polling config
- Store initial ETA for reference
- Track polling strategy state (waiting vs. polling phase)

**New State Properties**:

```javascript
{
  // ... existing properties ...

  // Polling Configuration
  pollingConfig: {
    initialEta: null,           // Initial ETA from 202 response
    waitingForInitialPhase: false, // Currently in 80% wait
    currentPollInterval: 2000,   // Current interval (updates dynamically)
    startTime: null,            // When polling began
  }
}
```

**Setter Methods to Add**:

```javascript
setPollingConfig(config) { /* ... */ }
updateCurrentPollInterval(ms) { /* ... */ }
setInitialEta(eta) { /* ... */ }
```

---

## Impact Analysis

### Component Dependency Graph

**Before** (tightly coupled):

```
GenerateFlow.svelte
  └─ Hardcoded interval logic (POLL_INTERVAL_MS)
```

**After** (decoupled):

```
GenerateFlow.svelte
  ├─ SmartPoller (import)
  └─ flowStore (for config management)

SmartPoller (standalone, independently testable)
  └─ Pure interval calculation logic
```

### Testing Implications

**Becomes testable**:

- SmartPoller.calculateInterval(eta) → returns correct interval
- SmartPoller.shouldWaitInitially(eta) → returns true/false correctly
- Interval progression: 10s → 5s → 2s → 500ms as ETA decreases

**Harder to test** (but acceptable):

- Full polling loop (remains integration test)
- Error handling during polling (remains integration test)

### Performance Impact

**Before**: 50 concurrent 30s jobs × 15 polls = 750 polls
**After**: 50 concurrent 30s jobs × 5.5 polls = 275 polls
**Improvement**: 63% reduction in polling load

---

## File Change Summary

### Files to Create

| File                            | Type       | Lines | Purpose                      |
| ------------------------------- | ---------- | ----- | ---------------------------- |
| `client/src/lib/SmartPoller.js` | New Module | ~80   | Polling interval calculation |

### Files to Modify

| File                                                                   | Section                | Change                                                  | Complexity |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------- | ---------- |
| [GenerateFlow.svelte](../../client/src/components/GenerateFlow.svelte) | `pollUntilComplete()`  | Replace hardcoded interval with SmartPoller calculation | Medium     |
| [flowStore.js](../../client/src/lib/stores/flowStore.js)               | State object & methods | Add polling config state + setters                      | Low        |

### Files NOT Changing

- `api.js` - No changes needed
- `PollingStatus.svelte` - No changes needed (displays already available data)
- Server-side implementation - No changes needed

---

## Design Decisions Explained

### Why a Separate SmartPoller Class?

**Considered Alternatives**:

1. **Inline logic in GenerateFlow.svelte**

   - ❌ Harder to test
   - ❌ Logic scattered across 60+ lines of polling code
   - ❌ Can't reuse in other components

2. **Helper function in api.js**

   - ❌ Mixes API concerns with polling strategy
   - ❌ Harder to discover

3. **SmartPoller class in lib/**
   - ✅ Pure, testable calculation logic
   - ✅ Clear separation of concerns
   - ✅ Reusable across components
   - ✅ Easy to configure

**Decision**: Create SmartPoller class in `lib/` for clarity and testability.

### Why Store Polling Config in flowStore?

**Rationale**:

- Polling configuration is app-wide state (affects UI display, timing)
- Other components may need to access current polling strategy
- Follows existing pattern of storing generation metadata
- Enables debugging/monitoring of polling behavior

---

## Validation Criteria

After implementing these changes, validate:

1. **Interval Calculation**

   - ✅ ETA > 30s → interval ≥ 10s
   - ✅ ETA 15-30s → interval 5s
   - ✅ ETA 5-15s → interval 2s
   - ✅ ETA < 5s → interval 500ms

2. **Initial Wait Phase**

   - ✅ Implemented when initialEta available
   - ✅ Waits 80% of ETA before first poll
   - ✅ Can be disabled via config

3. **Polling Behavior**

   - ✅ Jobs still complete successfully
   - ✅ No timeout issues (still 20 minute max)
   - ✅ Progress updates in real-time

4. **Store State**
   - ✅ currentPollInterval updates after each poll
   - ✅ initialEta set from 202 response
   - ✅ Polling phase tracked accurately

---

## Next Steps

1. **Review** - Architects validate this adjustment plan
2. **Implement** - See FRONTEND_ARCHITECTURE_IMPLEMENTATION.md for technical details
3. **Test** - Unit test SmartPoller, integration test polling loop
4. **Validate** - Verify against ARCHITECTURE_ROADMAP_EXECUTIVE.md spec
5. **Deploy** - Merge to main branch

---

## Open Questions for Review

1. **Initial ETA Source**: Should we get initialEta from 202 response or first poll?

   - Current: First poll (requires implementation detail)
   - Proposed: 202 response (requires server change to return initial ETA)

2. **Configuration Flexibility**: Should thresholds be configurable per job?

   - Current: Hardcoded in SmartPoller
   - Alternative: Pass via flowStore config

3. **Wait Phase Opt-Out**: Should initial wait phase be optional?
   - Rationale: Some jobs might want immediate polling
   - Default: Enabled (implements spec)

---

**Document Status**: Architecture Adjustment Plan (January 5, 2026)  
**Approval Status**: ⏳ Pending technical review  
**Implementation Status**: Not started  
**Related PR**: (Will be created after approval)
