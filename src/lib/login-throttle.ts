import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

interface AttemptRecord {
  failures: number;
  lastFailureAt: number;
  blockedUntil: number;
}

interface LoginThrottleStoreOptions {
  failureWindowMs?: number;
  maxBlockMs?: number;
  maxEntries?: number;
  maxFailures?: number;
  recordTtlMs?: number;
}

const DEFAULT_FAILURE_WINDOW_MS = 15 * 60_000;
const DEFAULT_MAX_BLOCK_MS = 60 * 60_000;
const DEFAULT_MAX_ENTRIES = 2_048;
const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_RECORD_TTL_MS = DEFAULT_MAX_BLOCK_MS + DEFAULT_FAILURE_WINDOW_MS;

export class LoginThrottleStore {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly failureWindowMs: number;
  private readonly maxBlockMs: number;
  private readonly maxEntries: number;
  private readonly maxFailures: number;
  private readonly recordTtlMs: number;

  constructor(options: LoginThrottleStoreOptions = {}) {
    this.failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
    this.maxBlockMs = options.maxBlockMs ?? DEFAULT_MAX_BLOCK_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.recordTtlMs = options.recordTtlMs ?? DEFAULT_RECORD_TTL_MS;
  }

  get size() {
    return this.attempts.size;
  }

  status(key: string, now = Date.now()) {
    this.prune(now);
    const record = this.attempts.get(key);
    if (!record) return { blocked: false, retryAfterSeconds: 0 };
    return {
      blocked: record.blockedUntil > now,
      retryAfterSeconds: Math.max(0, Math.ceil((record.blockedUntil - now) / 1_000)),
    };
  }

  recordFailure(key: string, now = Date.now()) {
    this.prune(now);
    this.ensureCapacity(key);
    const previous = this.attempts.get(key);
    const failures =
      previous && now - previous.lastFailureAt <= this.failureWindowMs
        ? previous.failures + 1
        : 1;
    const blockMultiplier = Math.max(0, failures - this.maxFailures);
    const blockMs = failures >= this.maxFailures
      ? Math.min(this.failureWindowMs * 2 ** blockMultiplier, this.maxBlockMs)
      : 0;
    this.attempts.set(key, {
      failures,
      lastFailureAt: now,
      blockedUntil: now + blockMs,
    });
    return {
      failures,
      blocked: blockMs > 0,
      retryAfterSeconds: Math.ceil(blockMs / 1_000),
    };
  }

  clear(key: string) {
    this.attempts.delete(key);
  }

  private prune(now: number) {
    for (const [key, record] of this.attempts) {
      const expiresAt = Math.max(
        record.blockedUntil,
        record.lastFailureAt + this.recordTtlMs,
      );
      if (expiresAt <= now) this.attempts.delete(key);
    }
  }

  private ensureCapacity(incomingKey: string) {
    if (this.attempts.has(incomingKey) || this.attempts.size < this.maxEntries) return;
    let oldestKey: string | null = null;
    let oldestFailureAt = Number.POSITIVE_INFINITY;
    for (const [key, record] of this.attempts) {
      if (record.lastFailureAt < oldestFailureAt) {
        oldestKey = key;
        oldestFailureAt = record.lastFailureAt;
      }
    }
    if (oldestKey) this.attempts.delete(oldestKey);
  }
}

interface LoginThrottleState {
  salt: string;
  store: LoginThrottleStore;
}

declare global {
  var __kgwLoginThrottleState: LoginThrottleState | undefined;
}

const throttleState = globalThis.__kgwLoginThrottleState ?? {
  salt: randomBytes(32).toString("hex"),
  store: new LoginThrottleStore(),
};
globalThis.__kgwLoginThrottleState = throttleState;

function normalizedIp(value: string | null | undefined) {
  const candidate = value?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

async function clientAddressBucket() {
  if (process.env.LOGIN_TRUST_PROXY_HEADERS !== "true") {
    return "shared-direct-client";
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  return (
    normalizedIp(requestHeaders.get("cf-connecting-ip")) ??
    normalizedIp(requestHeaders.get("x-real-ip")) ??
    normalizedIp(forwarded) ??
    "trusted-proxy-unknown"
  );
}

export async function loginAttemptKey() {
  const addressBucket = await clientAddressBucket();
  return createHash("sha256")
    .update(`${throttleState.salt}:${addressBucket}`)
    .digest("hex");
}

export function loginThrottleStatus(key: string) {
  return throttleState.store.status(key);
}

export function recordLoginFailure(key: string) {
  return throttleState.store.recordFailure(key);
}

export function clearLoginFailures(key: string) {
  throttleState.store.clear(key);
}
