<script lang="ts">
  import { contentStore, uiStateStore } from '../stores';
  import { exportToPdf } from '../lib/api';
  import { flowStore } from '../lib/stores/flowStore.js';

  let content: object | null;
  contentStore.subscribe(value => {
    content = value;
  });

  let uiState: { status: string; message: string };
  uiStateStore.subscribe(value => {
    uiState = value;
  });

  // Local progress for export (0-100)
  let progress = 0;
  let progressInterval = null;
  let lastError: string | null = null;

  const handleExport = async () => {
    if (!content) {
      uiStateStore.set({ status: 'error', message: 'No content to export.' });
      return;
    }

    // Start staged progress UI
    uiStateStore.set({ status: 'loading', message: 'Preparing images...' });
    progress = 5;
    // Increase progress slowly; real backend jobs would emit progress
    progressInterval = setInterval(() => {
      if (progress < 70) progress += Math.random() * 6;
      else if (progress < 95) progress += Math.random() * 2;
      progress = Math.min(99, Math.round(progress));
    }, 400);

  try {
      // Kick off the real export; this returns when download begins
      await exportToPdf(content);
      // On success, finish progress and clear interval
      progress = 100;
      lastError = null;
      uiStateStore.set({ status: 'success', message: 'PDF exported successfully.' });
    } catch (error) {
      const err = error as Error;
      lastError = err.message || 'Unknown error';
      uiStateStore.set({ status: 'error', message: `Export failed: ${err.message}` });
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      // reset progress after small delay so UI shows 100 briefly
      setTimeout(() => {
        progress = 0;
      }, 800);
    }
  };

  const handleRetry = () => {
    // Clear last error and trigger export again
    lastError = null;
    handleExport();
  };
</script>

{#if $flowStore.state === 'RESULT_READY'}
  <div class="export-container">
    <div class="actions-row">
      <button
        on:click={handleExport}
        disabled={uiState.status === 'loading'}
        aria-disabled={uiState.status === 'loading'}
        data-testid="export-button"
      >
        {#if uiState.status === 'loading'}
          Exporting... {progress}%
        {:else}
          Export to PDF
        {/if}
      </button>
      {#if uiState.status === 'error' && lastError}
        <button class="retry" on:click={handleRetry} data-testid="retry-button">Retry</button>
      {/if}
    </div>
    {#if uiState.status === 'loading'}
      <div class="progress-bar"><div class="progress" style="width: {progress}%"></div></div>
    {/if}
  </div>
{/if}

<style>
  .export-container {
    margin-top: 1.5rem;
  }
  button {
    width: 100%;
    padding: 0.75rem;
    border-radius: 4px;
    border: none;
    background-color: #16a085;
    color: white;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.2s;
  }
  button:hover {
    background-color: #1abc9c;
  }
  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
  .progress-bar { width: 100%; height: 8px; background: #eee; border-radius: 4px; margin-top: 8px; overflow: hidden }
  .progress { height: 100%; background: linear-gradient(90deg,#16a085,#1abc9c); width: 0 }
</style>
