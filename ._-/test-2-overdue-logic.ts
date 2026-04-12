/**
 * Unit tests for stale/overdue job detection logic.
 *
 * Run: pnpm vitest run --config ./vitest.config.mts ._-/test-2-overdue-logic.ts
 * (or add to vitest include pattern)
 */

import { describe, it, expect } from "vitest";

// Inline the stale detection logic so we can test without Next.js context
const STALE_THRESHOLDS: Record<string, number> = {
  new: 3,
  intake_received: 5,
  awaiting_pics_or_payment: 7,
};

/**
 * Returns the number of days a job is stale, or 0 if not stale.
 * @param status - job status
 * @param updatedAt - ISO date string of last update
 */
function getDaysStale(status: string, updatedAt: string | undefined): number {
  if (!updatedAt) return 0;
  const threshold = STALE_THRESHOLDS[status];
  if (!threshold) return 0;
  const days = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  return days > threshold ? days : 0;
}

/** Helper to create an ISO date string N days ago from now. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("Stale job detection", () => {
  it("job in 'new' status updated 4 days ago is stale", () => {
    const result = getDaysStale("new", daysAgo(4));
    expect(result).toBe(4);
  });

  it("job in 'new' status updated 2 days ago is not stale", () => {
    const result = getDaysStale("new", daysAgo(2));
    expect(result).toBe(0);
  });

  it("job in 'new' status updated exactly 3 days ago is not stale (threshold is >3)", () => {
    const result = getDaysStale("new", daysAgo(3));
    expect(result).toBe(0);
  });

  it("job in 'intake_received' updated 6 days ago is stale", () => {
    const result = getDaysStale("intake_received", daysAgo(6));
    expect(result).toBe(6);
  });

  it("job in 'intake_received' updated 4 days ago is not stale", () => {
    const result = getDaysStale("intake_received", daysAgo(4));
    expect(result).toBe(0);
  });

  it("job in 'awaiting_pics_or_payment' updated 10 days ago is stale", () => {
    const result = getDaysStale("awaiting_pics_or_payment", daysAgo(10));
    expect(result).toBe(10);
  });

  it("job in 'in_progress' is never stale (no threshold defined)", () => {
    const result = getDaysStale("in_progress", daysAgo(30));
    expect(result).toBe(0);
  });

  it("job with no updatedAt is not stale (safe default)", () => {
    const result = getDaysStale("new", undefined);
    expect(result).toBe(0);
  });

  it("job in 'delivered' is never stale (no threshold defined)", () => {
    const result = getDaysStale("delivered", daysAgo(100));
    expect(result).toBe(0);
  });
});
