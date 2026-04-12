/**
 * Unit tests for dashboard action mapping logic.
 * Tests the ACTION_MAP and toggle behavior in isolation.
 *
 * Run: pnpm vitest run --config ./vitest.config.mts ._-/test-1-dashboard-actions.ts
 * (or add to vitest include pattern)
 */

import { describe, it, expect } from "vitest";

// Inline the action map so we can test without importing from a Next.js route
const ACTION_MAP: Record<string, Record<string, unknown>> = {
  mark_intake_received: { status: "intake_received" },
  start_work: { status: "in_progress" },
  mark_awaiting: { status: "awaiting_pics_or_payment" },
  mark_ready_to_ship: { status: "ready_to_ship" },
  mark_delivered: { status: "delivered" },
};

/**
 * Resolves the update payload for a given action.
 * Returns null for invalid actions.
 * For toggle_pics_received, returns the flipped value.
 * @param action - action name from the dashboard
 * @param currentPicsReceived - current pics_received value (for toggle)
 */
function resolveAction(
  action: string,
  currentPicsReceived?: boolean
): Record<string, unknown> | null {
  if (action === "toggle_pics_received") {
    return { pics_received: !currentPicsReceived };
  }
  return ACTION_MAP[action] ?? null;
}

describe("Dashboard action mapping", () => {
  it("mark_intake_received sets status to intake_received", () => {
    const result = resolveAction("mark_intake_received");
    expect(result).toEqual({ status: "intake_received" });
  });

  it("start_work sets status to in_progress", () => {
    const result = resolveAction("start_work");
    expect(result).toEqual({ status: "in_progress" });
  });

  it("mark_awaiting sets status to awaiting_pics_or_payment", () => {
    const result = resolveAction("mark_awaiting");
    expect(result).toEqual({ status: "awaiting_pics_or_payment" });
  });

  it("mark_ready_to_ship sets status to ready_to_ship", () => {
    const result = resolveAction("mark_ready_to_ship");
    expect(result).toEqual({ status: "ready_to_ship" });
  });

  it("mark_delivered sets status to delivered", () => {
    const result = resolveAction("mark_delivered");
    expect(result).toEqual({ status: "delivered" });
  });

  it("invalid action returns null", () => {
    const result = resolveAction("nonexistent_action");
    expect(result).toBeNull();
  });

  it("toggle_pics_received flips false to true", () => {
    const result = resolveAction("toggle_pics_received", false);
    expect(result).toEqual({ pics_received: true });
  });

  it("toggle_pics_received flips true to false", () => {
    const result = resolveAction("toggle_pics_received", true);
    expect(result).toEqual({ pics_received: false });
  });

  it("toggle_pics_received with undefined defaults to true", () => {
    const result = resolveAction("toggle_pics_received", undefined);
    expect(result).toEqual({ pics_received: true });
  });
});
