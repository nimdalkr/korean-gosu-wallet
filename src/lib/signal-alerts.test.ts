import { describe, expect, it, vi } from "vitest";
import type { IntelligenceSignal } from "./domain";
import { deliverSignalAlerts } from "./signal-alerts";

function signal(score = 76, signalClass: IntelligenceSignal["signalClass"] = "alpha") {
  return {
    id: "cohort_trade:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:2026-08-05",
    kind: "cohort_trade",
    signalClass,
    direction: "bullish",
    severity: score >= 85 ? "critical" : "high",
    score,
    confidence: "high",
    occurredAt: "2026-08-05T11:30:00.000Z",
    windowHours: 24,
    title: "ALPHA 코호트 매수",
    summary: "두 지갑의 매수 근거가 확인됐습니다.",
    asset: null,
    targetAddress: null,
    targetName: null,
    wallets: [],
    exchangeCount: 2,
    transactionHashes: [],
    basescanUrls: [],
    evidence: [],
    reasons: [{ code: "trade", label: "매수 근거", points: score }],
    noiseCandidate: false,
    estimatedUsd: null,
  } satisfies IntelligenceSignal;
}

describe("deliverSignalAlerts", () => {
  it("delivers a new high signal and returns a stable dedupe key", async () => {
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await deliverSignalAlerts({
      signals: [signal()],
      deliveredSignalIds: {},
      generatedAt: "2026-08-05T12:00:00.000Z",
      webhookUrl: "https://hooks.example.com/intelligence",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.deliveredSignalIds).toEqual([
      "cohort_trade:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:2026-08-05@high",
    ]);
  });

  it("does not resend a high signal unless it escalates to critical", async () => {
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const highKey = `${signal().id}@high`;
    const first = await deliverSignalAlerts({
      signals: [signal()],
      deliveredSignalIds: { [highKey]: "2026-08-05T11:35:00.000Z" },
      generatedAt: "2026-08-05T12:00:00.000Z",
      webhookUrl: "https://hooks.example.com/intelligence",
      fetcher,
    });
    expect(first.attempted).toBe(0);

    const escalated = await deliverSignalAlerts({
      signals: [signal(90)],
      deliveredSignalIds: { [highKey]: "2026-08-05T11:35:00.000Z" },
      generatedAt: "2026-08-05T12:00:00.000Z",
      webhookUrl: "https://hooks.example.com/intelligence",
      fetcher,
    });
    expect(escalated.deliveredSignalIds[0]).toMatch(/@critical$/);
  });

  it("never sends noise-class signals", async () => {
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await deliverSignalAlerts({
      signals: [signal(99, "noise")],
      deliveredSignalIds: {},
      generatedAt: "2026-08-05T12:00:00.000Z",
      webhookUrl: "https://hooks.example.com/intelligence",
      fetcher,
    });
    expect(result.attempted).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects cleartext webhooks before any data leaves the process", async () => {
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await deliverSignalAlerts({
      signals: [signal()],
      deliveredSignalIds: {},
      generatedAt: "2026-08-05T12:00:00.000Z",
      webhookUrl: "http://hooks.example.com/intelligence",
      fetcher,
    });
    expect(result.warning).toContain("https");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
