import { describe, it, expect, beforeEach } from "vitest";
import SmartPoller from "../src/lib/SmartPoller.js";

describe("SmartPoller", () => {
  let poller;

  beforeEach(() => {
    poller = new SmartPoller();
  });

  describe("adjustInterval", () => {
    it("should return 10s interval for high ETA (>30s)", () => {
      const interval = poller.adjustInterval(40);
      expect(interval).toBe(10000);
    });

    it("should return 5s interval for medium ETA (15-30s)", () => {
      const interval = poller.adjustInterval(20);
      expect(interval).toBe(5000);
    });

    it("should return 2s interval for low ETA (5-15s)", () => {
      const interval = poller.adjustInterval(10);
      expect(interval).toBe(2000);
    });

    it("should return 500ms interval for critical ETA (<5s)", () => {
      const interval = poller.adjustInterval(3);
      expect(interval).toBe(500);
    });

    it("should handle boundary conditions", () => {
      expect(poller.adjustInterval(30)).toBe(5000); // Medium
      expect(poller.adjustInterval(15)).toBe(2000); // Low
      expect(poller.adjustInterval(5)).toBe(500); // Critical
    });

    it("should handle invalid input gracefully", () => {
      expect(poller.adjustInterval(-5)).toBe(2000); // Default
      expect(poller.adjustInterval("invalid")).toBe(2000); // Default
      expect(poller.adjustInterval(null)).toBe(2000); // Default
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

      expect(custom.adjustInterval(50)).toBe(5000); // Medium (was high)
      expect(custom.adjustInterval(20)).toBe(2000); // Low (was medium)
    });

    it("should accept custom intervals", () => {
      const custom = new SmartPoller({
        highEtaInterval: 20000,
        mediumEtaInterval: 10000,
      });

      expect(custom.adjustInterval(40)).toBe(20000);
      expect(custom.adjustInterval(20)).toBe(10000);
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
