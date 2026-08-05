import type { IntelligenceSignal } from "./domain";

const HOUR_MS = 3_600_000;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SignalAlertDeliveryResult {
  attempted: number;
  deliveredSignalIds: string[];
  warning: string | null;
}

function deliveryKey(signal: IntelligenceSignal) {
  return `${signal.id}@${signal.score >= 85 ? "critical" : "high"}`;
}

function wasDelivered(
  signal: IntelligenceSignal,
  deliveredSignalIds: Record<string, string>,
) {
  if (deliveredSignalIds[deliveryKey(signal)]) return true;
  return signal.score < 85 && Boolean(deliveredSignalIds[`${signal.id}@critical`]);
}

function compactSignal(signal: IntelligenceSignal) {
  return {
    id: signal.id,
    kind: signal.kind,
    signalClass: signal.signalClass,
    direction: signal.direction,
    severity: signal.severity,
    score: signal.score,
    confidence: signal.confidence,
    occurredAt: signal.occurredAt,
    title: signal.title,
    summary: signal.summary,
    asset: signal.asset,
    wallets: signal.wallets,
    evidence: signal.evidence,
    reasons: signal.reasons,
    basescanUrls: signal.basescanUrls,
  };
}

function discordPayload(signals: IntelligenceSignal[], dashboardUrl: string | null) {
  return {
    content: `KGW에서 ${signals.length}개의 신규 고우선순위 신호를 감지했습니다.${
      dashboardUrl ? `\n${dashboardUrl}` : ""
    }`,
    allowed_mentions: { parse: [] },
    embeds: signals.slice(0, 10).map((signal) => ({
      title: `[${signal.signalClass.toUpperCase()} ${signal.score}] ${signal.title}`,
      description: signal.summary.slice(0, 1_500),
      url: signal.basescanUrls[0] ?? dashboardUrl ?? undefined,
      color:
        signal.signalClass === "alpha"
          ? 0x42d6a4
          : signal.direction === "bearish"
            ? 0xf06a6a
            : 0xf0b65a,
      fields: [
        {
          name: "지갑 / 거래소",
          value: `${signal.wallets.length} wallets / ${signal.exchangeCount} cohort`,
          inline: true,
        },
        {
          name: "방향 / 신뢰도",
          value: `${signal.direction} / ${signal.confidence}`,
          inline: true,
        },
        {
          name: "핵심 근거",
          value: signal.reasons
            .slice(0, 4)
            .map((reason) => `${reason.points >= 0 ? "+" : ""}${reason.points} ${reason.label}`)
            .join("\n")
            .slice(0, 1_000),
        },
      ],
      timestamp: signal.occurredAt,
      footer: { text: "KGW / public-chain heuristic signal" },
    })),
  };
}

export async function deliverSignalAlerts(input: {
  signals: IntelligenceSignal[];
  deliveredSignalIds: Record<string, string>;
  generatedAt: string;
  webhookUrl?: string | null;
  webhookFormat?: "generic" | "discord";
  minScore?: number;
  lookbackHours?: number;
  maxSignals?: number;
  dashboardUrl?: string | null;
  fetcher?: FetchLike;
}): Promise<SignalAlertDeliveryResult> {
  const webhookUrl = input.webhookUrl?.trim();
  if (!webhookUrl) {
    return { attempted: 0, deliveredSignalIds: [], warning: null };
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return {
      attempted: 0,
      deliveredSignalIds: [],
      warning: "ALERT_WEBHOOK_URL is not a valid URL.",
    };
  }
  if (parsedUrl.protocol !== "https:") {
    return {
      attempted: 0,
      deliveredSignalIds: [],
      warning: "ALERT_WEBHOOK_URL must use https.",
    };
  }

  const minScore = input.minScore ?? 70;
  const lookbackHours = input.lookbackHours ?? 6;
  const maxSignals = input.maxSignals ?? 10;
  const cutoff = Date.parse(input.generatedAt) - lookbackHours * HOUR_MS;
  const candidates = input.signals
    .filter(
      (signal) =>
        signal.signalClass !== "noise" &&
        signal.score >= minScore &&
        Date.parse(signal.occurredAt) >= cutoff &&
        !wasDelivered(signal, input.deliveredSignalIds),
    )
    .sort(
      (a, b) =>
        b.score - a.score || Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    )
    .slice(0, maxSignals);
  if (!candidates.length) {
    return { attempted: 0, deliveredSignalIds: [], warning: null };
  }

  const payload = input.webhookFormat === "discord"
    ? discordPayload(candidates, input.dashboardUrl?.trim() || null)
    : {
        version: 1,
        event: "kgw.intelligence_signals.detected",
        generatedAt: input.generatedAt,
        dashboardUrl: input.dashboardUrl?.trim() || null,
        signalCount: candidates.length,
        signals: candidates.map(compactSignal),
      };
  try {
    const response = await (input.fetcher ?? fetch)(parsedUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const responseText = (await response.text()).slice(0, 200);
      return {
        attempted: candidates.length,
        deliveredSignalIds: [],
        warning: `Signal webhook returned ${response.status}: ${responseText}`,
      };
    }
    return {
      attempted: candidates.length,
      deliveredSignalIds: candidates.map(deliveryKey),
      warning: null,
    };
  } catch (error) {
    return {
      attempted: candidates.length,
      deliveredSignalIds: [],
      warning: `Signal webhook failed: ${(error as Error).message}`,
    };
  }
}
