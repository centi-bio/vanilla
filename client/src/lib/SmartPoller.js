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
   * Adjust polling interval based on remaining ETA
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
   * poller.adjustInterval(30); // Returns 10000 (10 seconds)
   * poller.adjustInterval(15); // Returns 5000 (5 seconds)
   * poller.adjustInterval(8);  // Returns 2000 (2 seconds)
   * poller.adjustInterval(3);  // Returns 500 (500ms)
   */
  adjustInterval(etaSeconds) {
    // Validate input
    if (typeof etaSeconds !== "number" || etaSeconds < 0) {
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
