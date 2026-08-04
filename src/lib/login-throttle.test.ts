import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { LoginThrottleStore } from "./login-throttle";

describe("LoginThrottleStore", () => {
  it("blocks after the configured consecutive failure threshold", () => {
    const store = new LoginThrottleStore({
      failureWindowMs: 1_000,
      maxBlockMs: 4_000,
      maxFailures: 3,
      recordTtlMs: 5_000,
    });

    expect(store.recordFailure("client", 0).blocked).toBe(false);
    expect(store.recordFailure("client", 100).blocked).toBe(false);
    expect(store.recordFailure("client", 200)).toMatchObject({
      failures: 3,
      blocked: true,
      retryAfterSeconds: 1,
    });
    expect(store.status("client", 200).blocked).toBe(true);
    expect(store.status("client", 1_200).blocked).toBe(false);
  });

  it("removes records after their TTL", () => {
    const store = new LoginThrottleStore({ recordTtlMs: 1_000 });
    store.recordFailure("expired", 0);

    expect(store.size).toBe(1);
    expect(store.status("expired", 1_001)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
    expect(store.size).toBe(0);
  });

  it("caps memory and evicts the oldest failure record", () => {
    const store = new LoginThrottleStore({ maxEntries: 2 });
    store.recordFailure("oldest", 100);
    store.recordFailure("second", 200);
    store.recordFailure("third", 300);

    expect(store.size).toBe(2);
    expect(store.recordFailure("oldest", 400).failures).toBe(1);
    expect(store.size).toBe(2);
  });
});
