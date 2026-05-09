// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeSnapshot } from "../sanitizeSnapshot";

describe("sanitizeSnapshot", () => {
  it("returns null for non-objects", () => {
    expect(sanitizeSnapshot(null)).toBeNull();
    expect(sanitizeSnapshot("string")).toBeNull();
    expect(sanitizeSnapshot(42)).toBeNull();
    expect(sanitizeSnapshot([])).toBeNull();
  });

  it("keeps known string fields", () => {
    const result = sanitizeSnapshot({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
    });
    expect(result).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
    });
  });

  it("drops unknown keys", () => {
    const result = sanitizeSnapshot({
      email: "ada@example.com",
      __proto__: "evil",
      injected: "bad",
      constructor: "bad",
    });
    expect(result).toEqual({ email: "ada@example.com" });
  });

  it("drops non-string values (no File or Blob objects)", () => {
    const result = sanitizeSnapshot({
      email: "ada@example.com",
      pet_name: 123,
      notes: { nested: true },
      phone: null,
    });
    expect(result).toEqual({ email: "ada@example.com" });
  });

  it("caps string length at 2000 characters", () => {
    const long = "x".repeat(3000);
    const result = sanitizeSnapshot({ notes: long });
    expect(result!.notes).toHaveLength(2000);
  });

  it("allows stripe_checkout_session_id", () => {
    const result = sanitizeSnapshot({
      stripe_checkout_session_id: "cs_test_abc123",
    });
    expect(result).toEqual({ stripe_checkout_session_id: "cs_test_abc123" });
  });

  it("returns an empty object for an empty input", () => {
    expect(sanitizeSnapshot({})).toEqual({});
  });
});
