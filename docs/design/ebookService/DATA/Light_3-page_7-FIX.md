# Fix: Field Name Mismatch in Progress Updates

**Date**: January 5, 2026 @ 12:25PM
**Branch**: `feat/adaptive-polling`

**Fix Type**: Data Contract Alignment

---

## The Correction

**File**: [client/src/lib/stores/flowStore.js](../../../../../client/src/lib/stores/flowStore.js#L181)

### Before (Broken)

```javascript
updateProgress(progressData) {
  update((store) => ({
    ...store,
    currentProgressPercent:
      progressData.percent ?? store.currentProgressPercent,  // ← expects 'percent'
    currentMessage: progressData.message ?? store.currentMessage,
    currentEta: progressData.eta ?? store.currentEta,
    calls_completed: progressData.calls_completed ?? store.calls_completed,
    calls_total: progressData.calls_total ?? store.calls_total,
  }));
},
```

### After (Fixed)

```javascript
updateProgress(progressData) {
  update((store) => ({
    ...store,
    currentProgressPercent:
      progressData.progress_percent ?? store.currentProgressPercent,  // ← expects 'progress_percent'
    currentMessage: progressData.message ?? store.currentMessage,
    currentEta: progressData.eta ?? store.currentEta,
    calls_completed: progressData.calls_completed ?? store.calls_completed,
    calls_total: progressData.calls_total ?? store.calls_total,
  }));
},
```

**Change**: Line 186 only  
`progressData.percent` → `progressData.progress_percent`

---

## Implementation Details

### Why This Works

1. **PollingStatus.svelte** (line 5) destructures from store:

   ```javascript
   $: ({ currentProgressPercent, currentEta, calls_completed, calls_total } =
     $flowStore);
   ```

2. **GenerateFlow.svelte** (line 281) calls updateProgress with:

   ```javascript
   flowStore.updateProgress({
     progress_percent: status.progress_percent || 0,
     eta: status.eta,
     calls_completed: status.calls_completed,
     calls_total: status.calls_total,
   });
   ```

3. **Server endpoint** (/api/status/:resultId) returns:
   ```json
   {
     "status": "processing",
     "progress_percent": 25,
     "eta": 45,
     "calls_completed": 1,
     "calls_total": 4
   }
   ```

**Now**: All field names align end-to-end ✅

---

## Result

When polling status arrives:

- ✅ `currentProgressPercent` updates correctly
- ✅ `currentEta` reflects remaining time
- ✅ `calls_completed` / `calls_total` show step progress
- ✅ PollingStatus component renders with live data
- ✅ Progress bar animates from 0% → 100%
- ✅ User sees "Working on your content..." with real progress

When job completes and transitions to RESULT_READY:

- ✅ PollingStatus disappears
- ✅ Content preview and export button appear
- ✅ Export button has access to result data

---

## Testing

**Manual verification**:

1. Click "Generate"
2. Observe POLLING screen with progress bar animating
3. Watch ETA and step count update in real-time
4. Confirm transition to RESULT_READY when complete

**No new code added** - only field name alignment. All infrastructure (SmartPoller, adaptive intervals, POLLING state) already in place and working.
