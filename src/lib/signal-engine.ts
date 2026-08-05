import type {
  ActivityAsset,
  ActivityEvent,
  AssetWatchItem,
  Confidence,
  IntelligenceSignal,
  NormalizedTransaction,
  NormalizedTransfer,
  SignalClass,
  SignalDirection,
  SignalKind,
  SignalReason,
  SignalSeverity,
  SignalTrendPoint,
  SignalWallet,
  TokenMetadata,
  WalletSeed,
} from "./domain";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SIGNAL_WINDOW_DAYS = 30;
const SIGNAL_LIMIT = 400;
const QUID_TOKEN_ADDRESS = "0x1a44233fae8d50f1aeb3a5d58dd426ff4814cb53";

export const ACTIONABLE_SIGNAL_SCORE = 70;

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface IntelligenceMetrics {
  actionableSignals24h: number;
  alphaSignals7d: number;
  highAnomalies24h: number;
  noiseSignals24h: number;
  meaningfulActivities24h: number;
  noiseFilteredActivities24h: number;
  signalAssets7d: number;
}

interface WalletSignalSummary {
  signalCount24h: number;
  signalCount7d: number;
  maxSignalScore: number;
}

export interface IntelligenceResult {
  signals: IntelligenceSignal[];
  signalTrend: SignalTrendPoint[];
  assetWatchlist: AssetWatchItem[];
  metrics: IntelligenceMetrics;
  walletSignals: Map<string, WalletSignalSummary>;
}

interface AssetDayGroup {
  date: string;
  token: TokenMetadata;
  transfers: NormalizedTransfer[];
}

function kstDate(timestamp: string) {
  return KST_DATE_FORMATTER.format(new Date(timestamp));
}

function finiteNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function activityAsset(token: TokenMetadata, amount?: string): ActivityAsset {
  return {
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    type: token.type,
    amount,
  };
}

function isNft(token: TokenMetadata) {
  return token.type === "ERC-721" || token.type === "ERC-1155";
}

function isSuspectedSpamToken(token: TokenMetadata) {
  if (token.reputation?.toLowerCase() === "spam") return true;
  return /(?:https?:\/\/|t\.me|claim\s|visit\s|install\s|free\s+mint|airdrop)/i.test(
    `${token.name} ${token.symbol}`,
  );
}

function transferAmount(transfer: NormalizedTransfer) {
  if (isNft(transfer.token)) return 1;
  return finiteNumber(transfer.amount) ?? 0;
}

function transferUsd(transfer: NormalizedTransfer) {
  if (isNft(transfer.token)) return null;
  const amount = finiteNumber(transfer.amount);
  const rate = finiteNumber(transfer.token.exchangeRateUsd);
  if (amount === null || rate === null || amount < 0 || rate < 0) return null;
  const value = amount * rate;
  return Number.isFinite(value) ? value : null;
}

function sumKnownUsd(transfers: NormalizedTransfer[]) {
  const values = transfers
    .map(transferUsd)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function frequencyRatio(values: string[]) {
  if (!values.length) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

function signalSeverity(score: number): SignalSeverity {
  if (score >= 85) return "critical";
  if (score >= ACTIONABLE_SIGNAL_SCORE) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function signalId(kind: SignalKind, key: string, date: string) {
  return `${kind}:${key.toLowerCase()}:${date}`;
}

function transactionKey(walletAddress: string, transactionHash: string) {
  return `${walletAddress.toLowerCase()}:${transactionHash.toLowerCase()}`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function latestTimestamp(values: Array<{ occurredAt: string }>) {
  return values.reduce(
    (latest, item) =>
      Date.parse(item.occurredAt) > Date.parse(latest) ? item.occurredAt : latest,
    values[0]?.occurredAt ?? new Date(0).toISOString(),
  );
}

function makeWallets(
  addresses: string[],
  activityCounts: Map<string, number>,
  walletByAddress: Map<string, WalletSeed>,
): SignalWallet[] {
  return unique(addresses.map((address) => address.toLowerCase()))
    .map((address) => {
      const wallet = walletByAddress.get(address);
      if (!wallet) return null;
      return {
        address,
        exchange: wallet.exchange,
        rank: wallet.rank,
        inTop100: wallet.inTop100,
        activityCount: activityCounts.get(address) ?? 1,
      } satisfies SignalWallet;
    })
    .filter((wallet): wallet is SignalWallet => Boolean(wallet))
    .sort(
      (a, b) =>
        Number(b.inTop100) - Number(a.inTop100) ||
        a.rank - b.rank ||
        a.address.localeCompare(b.address),
    );
}

function makeSignal(input: {
  kind: SignalKind;
  key: string;
  date: string;
  signalClass: SignalClass;
  direction: SignalDirection;
  confidence: Confidence;
  occurredAt: string;
  windowHours: number;
  title: string;
  summary: string;
  asset?: ActivityAsset | null;
  targetAddress?: string | null;
  targetName?: string | null;
  wallets: SignalWallet[];
  transactionHashes: string[];
  evidence: string[];
  reasons: SignalReason[];
  noiseCandidate?: boolean;
  estimatedUsd?: number | null;
}): IntelligenceSignal {
  const score = Math.max(
    0,
    Math.min(100, input.reasons.reduce((sum, reason) => sum + reason.points, 0)),
  );
  const transactionHashes = unique(input.transactionHashes.map((hash) => hash.toLowerCase())).slice(
    0,
    12,
  );
  return {
    id: signalId(input.kind, input.key, input.date),
    kind: input.kind,
    signalClass: input.signalClass,
    direction: input.direction,
    severity: signalSeverity(score),
    score,
    confidence: input.confidence,
    occurredAt: input.occurredAt,
    windowHours: input.windowHours,
    title: input.title,
    summary: input.summary,
    asset: input.asset ?? null,
    targetAddress: input.targetAddress ?? null,
    targetName: input.targetName ?? null,
    wallets: input.wallets,
    exchangeCount: new Set(input.wallets.map((wallet) => wallet.exchange)).size,
    transactionHashes,
    basescanUrls: transactionHashes.map((hash) => `https://basescan.org/tx/${hash}`),
    evidence: input.evidence,
    reasons: input.reasons,
    noiseCandidate: input.noiseCandidate ?? false,
    estimatedUsd: input.estimatedUsd ?? null,
  };
}

function activityIsMeaningful(activity: ActivityEvent) {
  if (activity.suspectedSpam) return false;
  if (activity.primaryAsset?.address.toLowerCase() === QUID_TOKEN_ADDRESS) return false;
  if (
    [
      "token_buy_candidate",
      "token_sell_candidate",
      "nft_purchase_candidate",
      "nft_sale_candidate",
      "nft_mint",
      "bridge",
      "staking",
      "liquidity",
    ].includes(activity.category)
  ) {
    return true;
  }
  return activity.initiatedByWallet;
}

function buildCohortTradeSignals(input: {
  activities: ActivityEvent[];
  walletByAddress: Map<string, WalletSeed>;
}) {
  const groups = new Map<string, ActivityEvent[]>();
  for (const activity of input.activities) {
    if (
      activity.suspectedSpam ||
      !activity.primaryAsset ||
      activity.primaryAsset.address.toLowerCase() === QUID_TOKEN_ADDRESS ||
      ![
        "token_buy_candidate",
        "nft_purchase_candidate",
        "nft_mint",
      ].includes(activity.category)
    ) {
      continue;
    }
    const date = kstDate(activity.occurredAt);
    const key = `${activity.primaryAsset.address.toLowerCase()}:${date}`;
    const current = groups.get(key) ?? [];
    current.push(activity);
    groups.set(key, current);
  }

  const signals: IntelligenceSignal[] = [];
  const assetDates = new Set<string>();
  for (const activities of groups.values()) {
    const addresses = unique(activities.map((activity) => activity.walletAddress));
    if (addresses.length < 2) continue;
    const first = activities[0];
    const asset = first.primaryAsset;
    if (!asset) continue;
    const date = kstDate(first.occurredAt);
    const activityCounts = new Map<string, number>();
    for (const activity of activities) {
      activityCounts.set(
        activity.walletAddress,
        (activityCounts.get(activity.walletAddress) ?? 0) + 1,
      );
    }
    const wallets = makeWallets(addresses, activityCounts, input.walletByAddress);
    const exchangeCount = new Set(wallets.map((wallet) => wallet.exchange)).size;
    const top100Count = wallets.filter((wallet) => wallet.inTop100).length;
    const reasons: SignalReason[] = [
      { code: "trade_evidence", label: "결제 흐름 또는 민팅 근거 확인", points: 55 },
      {
        code: "wallet_breadth",
        label: `${wallets.length}개 지갑이 같은 자산 행동`,
        points: Math.min(20, 5 + wallets.length * 4),
      },
    ];
    if (exchangeCount > 1) {
      reasons.push({ code: "cross_exchange", label: "업비트·빗썸 코호트 동시 확인", points: 10 });
    }
    if (top100Count >= 2) {
      reasons.push({ code: "top100", label: `TOP100 지갑 ${top100Count}개 참여`, points: 8 });
    }
    if (activities.every((activity) => activity.initiatedByWallet)) {
      reasons.push({ code: "wallet_initiated", label: "모든 행동이 지갑 주도", points: 7 });
    }
    const signal = makeSignal({
      kind: "cohort_trade",
      key: asset.address,
      date,
      signalClass: "alpha",
      direction: "bullish",
      confidence: "high",
      occurredAt: latestTimestamp(activities),
      windowHours: 24,
      title: `${asset.symbol || asset.name} 코호트 매수·민팅`,
      summary: `${wallets.length}개 추적 지갑에서 같은 자산의 결제 동반 매수 또는 민팅 근거가 확인됐습니다.`,
      asset,
      wallets,
      transactionHashes: activities.map((activity) => activity.transactionHash),
      evidence: [
        `동일 자산 행동 ${activities.length}건`,
        `독립 지갑 ${wallets.length}개`,
        `거래소 코호트 ${exchangeCount}개`,
      ],
      reasons,
    });
    signals.push(signal);
    assetDates.add(`${asset.address.toLowerCase()}:${date}`);
  }
  return { signals, assetDates };
}

function buildAssetFlowSignals(input: {
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  walletByAddress: Map<string, WalletSeed>;
  hotWallets: Set<string>;
  confirmedTradeAssetDates: Set<string>;
}) {
  const initiatedTransactionKeys = new Set(
    input.transactions
      .filter(
        (transaction) =>
          transaction.source !== "internal" &&
          transaction.direction === "out" &&
          transaction.status === "ok",
      )
      .map((transaction) =>
        transactionKey(transaction.walletAddress, transaction.transactionHash),
      ),
  );
  const earliestAssetAt = new Map<string, number>();
  const groups = new Map<string, AssetDayGroup>();
  for (const transfer of input.transfers) {
    const address = transfer.token.address.toLowerCase();
    if (address === QUID_TOKEN_ADDRESS) continue;
    const timestamp = Date.parse(transfer.occurredAt);
    earliestAssetAt.set(address, Math.min(earliestAssetAt.get(address) ?? timestamp, timestamp));
    const date = kstDate(transfer.occurredAt);
    const key = `${address}:${date}`;
    const current = groups.get(key) ?? { date, token: transfer.token, transfers: [] };
    current.transfers.push(transfer);
    groups.set(key, current);
  }

  const signals: IntelligenceSignal[] = [];
  for (const group of groups.values()) {
    const incoming = group.transfers.filter((transfer) => transfer.direction === "in");
    const outgoing = group.transfers.filter((transfer) => transfer.direction === "out");
    const inWallets = unique(incoming.map((transfer) => transfer.walletAddress));
    const outWallets = unique(outgoing.map((transfer) => transfer.walletAddress));
    const activityCounts = new Map<string, number>();
    for (const transfer of group.transfers) {
      activityCounts.set(
        transfer.walletAddress,
        (activityCounts.get(transfer.walletAddress) ?? 0) + 1,
      );
    }
    const sourceConcentration = frequencyRatio(
      incoming.map((transfer) => transfer.from.toLowerCase()),
    );
    const amountConcentration = frequencyRatio(incoming.map((transfer) => transfer.rawAmount));
    const destinationConcentration = frequencyRatio(
      outgoing.map((transfer) => transfer.to.toLowerCase()),
    );
    const initiatedIncoming = incoming.filter((transfer) =>
      initiatedTransactionKeys.has(
        transactionKey(transfer.walletAddress, transfer.transactionHash),
      ),
    ).length;
    const initiatedRatio = incoming.length ? initiatedIncoming / incoming.length : 0;
    const passiveRatio = incoming.length ? 1 - initiatedRatio : 0;
    const spam = isSuspectedSpamToken(group.token);
    const distributionLike =
      (spam && inWallets.length >= 2) ||
      (inWallets.length >= 5 &&
        passiveRatio >= 0.8 &&
        (sourceConcentration >= 0.6 || amountConcentration >= 0.6));
    const estimatedInboundUsd = sumKnownUsd(incoming);
    const estimatedOutboundUsd = sumKnownUsd(outgoing);
    const exchangeDestinationCount = outgoing.filter((transfer) =>
      input.hotWallets.has(transfer.to.toLowerCase()),
    ).length;
    const firstSeenAt = earliestAssetAt.get(group.token.address.toLowerCase()) ?? 0;
    const groupStart = Math.min(...group.transfers.map((transfer) => Date.parse(transfer.occurredAt)));
    const cohortNovel = groupStart - firstSeenAt < 2 * DAY_MS;

    if (distributionLike) {
      const wallets = makeWallets(inWallets, activityCounts, input.walletByAddress);
      const exchangeCount = new Set(wallets.map((wallet) => wallet.exchange)).size;
      const reasons: SignalReason[] = [
        { code: "distribution_pattern", label: "대량 살포 패턴", points: 35 },
        {
          code: "wallet_breadth",
          label: `${wallets.length}개 지갑에 동시 유입`,
          points: Math.min(30, wallets.length * 2),
        },
      ];
      if (sourceConcentration >= 0.6) {
        reasons.push({
          code: "single_source",
          label: `단일 발신자 집중 ${(sourceConcentration * 100).toFixed(0)}%`,
          points: 12,
        });
      }
      if (amountConcentration >= 0.6) {
        reasons.push({
          code: "identical_amount",
          label: `동일 금액 반복 ${(amountConcentration * 100).toFixed(0)}%`,
          points: 10,
        });
      }
      if (exchangeCount > 1) {
        reasons.push({ code: "cross_exchange", label: "양 거래소 코호트에 확산", points: 8 });
      }
      if (spam) {
        reasons.push({ code: "spam_metadata", label: "스팸성 메타데이터", points: 10 });
      }
      signals.push(
        makeSignal({
          kind: "distribution_blast",
          key: group.token.address,
          date: group.date,
          signalClass: "noise",
          direction: "neutral",
          confidence: "high",
          occurredAt: latestTimestamp(incoming),
          windowHours: 24,
          title: `${group.token.symbol} 대량 살포형 유입`,
          summary: `${wallets.length}개 지갑의 수동 수신이 단일 발신자 또는 동일 금액에 집중돼 관심 매수보다 배포·스팸 가능성이 높습니다.`,
          asset: activityAsset(group.token),
          wallets,
          transactionHashes: incoming.map((transfer) => transfer.transactionHash),
          evidence: [
            `수동 유입 비율 ${(passiveRatio * 100).toFixed(0)}%`,
            `발신자 집중도 ${(sourceConcentration * 100).toFixed(0)}%`,
            `동일 금액 집중도 ${(amountConcentration * 100).toFixed(0)}%`,
          ],
          reasons,
          noiseCandidate: true,
          estimatedUsd: estimatedInboundUsd,
        }),
      );
    } else if (
      inWallets.length >= 2 &&
      !input.confirmedTradeAssetDates.has(
        `${group.token.address.toLowerCase()}:${group.date}`,
      )
    ) {
      const netByWallet = new Map<string, number>();
      for (const transfer of group.transfers) {
        const signedAmount = transferAmount(transfer) * (transfer.direction === "in" ? 1 : -1);
        netByWallet.set(
          transfer.walletAddress,
          (netByWallet.get(transfer.walletAddress) ?? 0) + signedAmount,
        );
      }
      const positiveWallets = [...netByWallet.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([address]) => address);
      if (positiveWallets.length >= 2) {
        const wallets = makeWallets(positiveWallets, activityCounts, input.walletByAddress);
        const exchangeCount = new Set(wallets.map((wallet) => wallet.exchange)).size;
        const top100Count = wallets.filter((wallet) => wallet.inTop100).length;
        const totalIncoming = incoming.reduce((sum, transfer) => sum + transferAmount(transfer), 0);
        const totalOutgoing = outgoing.reduce((sum, transfer) => sum + transferAmount(transfer), 0);
        const retentionRatio = totalIncoming > 0
          ? Math.max(0, Math.min(1, (totalIncoming - totalOutgoing) / totalIncoming))
          : 0;
        const reasons: SignalReason[] = [
          { code: "positive_net_flow", label: "다지갑 순유입 확인", points: 30 },
          {
            code: "wallet_breadth",
            label: `${wallets.length}개 지갑이 순유입`,
            points: Math.min(18, 4 + wallets.length * 3),
          },
        ];
        if (exchangeCount > 1) {
          reasons.push({ code: "cross_exchange", label: "업비트·빗썸 코호트 동시 확인", points: 8 });
        }
        if (top100Count >= 2) {
          reasons.push({ code: "top100", label: `TOP100 지갑 ${top100Count}개 참여`, points: 6 });
        }
        if (initiatedRatio >= 0.5) {
          reasons.push({ code: "wallet_initiated", label: "지갑 주도 유입 비중 50% 이상", points: 15 });
        } else if (initiatedRatio >= 0.2) {
          reasons.push({ code: "wallet_initiated", label: "일부 지갑 주도 유입 확인", points: 7 });
        }
        if (retentionRatio >= 0.7) {
          reasons.push({ code: "retention", label: "당일 순보유 유지율 70% 이상", points: 12 });
        } else if (retentionRatio >= 0.3) {
          reasons.push({ code: "retention", label: "당일 순보유 유지", points: 6 });
        }
        if (cohortNovel) {
          reasons.push({ code: "cohort_novelty", label: "30일 코호트에서 새로 포착된 자산", points: 8 });
        }
        if ((estimatedInboundUsd ?? 0) >= 10_000) {
          reasons.push({ code: "notional", label: "추정 유입가치 $10K 이상", points: 8 });
        } else if ((estimatedInboundUsd ?? 0) >= 1_000) {
          reasons.push({ code: "notional", label: "추정 유입가치 $1K 이상", points: 4 });
        }
        if (passiveRatio >= 0.8 && sourceConcentration >= 0.5) {
          reasons.push({ code: "passive_penalty", label: "수동·집중 유입 감점", points: -15 });
        }
        const signal = makeSignal({
          kind: "cohort_accumulation",
          key: group.token.address,
          date: group.date,
          signalClass: "alpha",
          direction: "bullish",
          confidence: initiatedRatio >= 0.5 ? "high" : "medium",
          occurredAt: latestTimestamp(incoming),
          windowHours: 24,
          title: `${group.token.symbol} 코호트 순유입`,
          summary: `${wallets.length}개 지갑의 당일 순유입이 확인됐습니다. 수동 배포 패턴은 아니지만 매수 확정이 아닌 관심 후보입니다.`,
          asset: activityAsset(group.token),
          wallets,
          transactionHashes: incoming.map((transfer) => transfer.transactionHash),
          evidence: [
            `순유입 지갑 ${wallets.length}개`,
            `지갑 주도 유입 비율 ${(initiatedRatio * 100).toFixed(0)}%`,
            `당일 순보유 유지율 ${(retentionRatio * 100).toFixed(0)}%`,
          ],
          reasons,
          estimatedUsd: estimatedInboundUsd,
        });
        if (signal.score >= 45) signals.push(signal);
      }
    }

    if (outWallets.length >= 2 && !spam) {
      const wallets = makeWallets(outWallets, activityCounts, input.walletByAddress);
      const exchangeCount = new Set(wallets.map((wallet) => wallet.exchange)).size;
      const top100Count = wallets.filter((wallet) => wallet.inTop100).length;
      const reasons: SignalReason[] = [
        { code: "coordinated_outflow", label: "다지갑 동시 유출", points: 40 },
        {
          code: "wallet_breadth",
          label: `${wallets.length}개 지갑이 같은 자산 유출`,
          points: Math.min(24, 4 + wallets.length * 4),
        },
      ];
      if (exchangeCount > 1) {
        reasons.push({ code: "cross_exchange", label: "양 거래소 코호트에서 동시 확인", points: 8 });
      }
      if (destinationConcentration >= 0.5) {
        reasons.push({
          code: "destination_convergence",
          label: `동일 목적지 집중 ${(destinationConcentration * 100).toFixed(0)}%`,
          points: 12,
        });
      }
      if (exchangeDestinationCount > 0) {
        reasons.push({
          code: "exchange_destination",
          label: `알려진 거래소 핫월렛 유입 ${exchangeDestinationCount}건`,
          points: 12,
        });
      }
      if (top100Count >= 2) {
        reasons.push({ code: "top100", label: `TOP100 지갑 ${top100Count}개 참여`, points: 7 });
      }
      if ((estimatedOutboundUsd ?? 0) >= 10_000) {
        reasons.push({ code: "notional", label: "추정 유출가치 $10K 이상", points: 8 });
      } else if ((estimatedOutboundUsd ?? 0) >= 1_000) {
        reasons.push({ code: "notional", label: "추정 유출가치 $1K 이상", points: 4 });
      }
      signals.push(
        makeSignal({
          kind: "coordinated_outflow",
          key: group.token.address,
          date: group.date,
          signalClass: "anomaly",
          direction: "bearish",
          confidence: exchangeDestinationCount > 0 ? "high" : "medium",
          occurredAt: latestTimestamp(outgoing),
          windowHours: 24,
          title: `${group.token.symbol} 다지갑 동시 유출`,
          summary: `${wallets.length}개 추적 지갑에서 같은 자산의 유출이 겹쳤습니다. 거래소 입금 또는 매도는 목적지 확인 전까지 추정입니다.`,
          asset: activityAsset(group.token),
          wallets,
          transactionHashes: outgoing.map((transfer) => transfer.transactionHash),
          evidence: [
            `유출 트랜잭션 ${outgoing.length}건`,
            `목적지 집중도 ${(destinationConcentration * 100).toFixed(0)}%`,
            `거래소 핫월렛 일치 ${exchangeDestinationCount}건`,
          ],
          reasons,
          estimatedUsd: estimatedOutboundUsd,
        }),
      );
    }
  }
  return signals;
}

function buildContractSignals(input: {
  transactions: NormalizedTransaction[];
  walletByAddress: Map<string, WalletSeed>;
}) {
  const relevant = input.transactions.filter(
    (transaction) =>
      transaction.source !== "internal" &&
      transaction.direction === "out" &&
      transaction.status === "ok" &&
      transaction.to &&
      (transaction.toIsContract === true || Boolean(transaction.method)) &&
      !/^(?:transfer|approve|setapprovalforall|permit)$/i.test(transaction.method ?? ""),
  );
  const earliestTargetAt = new Map<string, number>();
  const groups = new Map<string, NormalizedTransaction[]>();
  for (const transaction of relevant) {
    const target = transaction.to?.toLowerCase();
    if (!target) continue;
    const timestamp = Date.parse(transaction.occurredAt);
    earliestTargetAt.set(target, Math.min(earliestTargetAt.get(target) ?? timestamp, timestamp));
    const date = kstDate(transaction.occurredAt);
    const key = `${target}:${date}`;
    const current = groups.get(key) ?? [];
    current.push(transaction);
    groups.set(key, current);
  }

  const signals: IntelligenceSignal[] = [];
  for (const transactions of groups.values()) {
    const addresses = unique(transactions.map((transaction) => transaction.walletAddress));
    if (addresses.length < 2) continue;
    const target = transactions[0].to?.toLowerCase();
    if (!target) continue;
    const date = kstDate(transactions[0].occurredAt);
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      counts.set(
        transaction.walletAddress,
        (counts.get(transaction.walletAddress) ?? 0) + 1,
      );
    }
    const wallets = makeWallets(addresses, counts, input.walletByAddress);
    const exchangeCount = new Set(wallets.map((wallet) => wallet.exchange)).size;
    const top100Count = wallets.filter((wallet) => wallet.inTop100).length;
    const groupStart = Math.min(...transactions.map((transaction) => Date.parse(transaction.occurredAt)));
    const novel = groupStart - (earliestTargetAt.get(target) ?? groupStart) < 2 * DAY_MS;
    const targetName = transactions.find((transaction) => transaction.toName)?.toName ?? null;
    const methods = unique(transactions.map((transaction) => transaction.method ?? "unknown"));
    const reasons: SignalReason[] = [
      { code: "contract_convergence", label: "동일 컨트랙트 다지갑 호출", points: 48 },
      {
        code: "wallet_breadth",
        label: `${wallets.length}개 지갑 참여`,
        points: Math.min(20, 4 + wallets.length * 4),
      },
    ];
    if (exchangeCount > 1) {
      reasons.push({ code: "cross_exchange", label: "업비트·빗썸 코호트 교차 확인", points: 10 });
    }
    if (top100Count >= 2) {
      reasons.push({ code: "top100", label: `TOP100 지갑 ${top100Count}개 참여`, points: 8 });
    }
    if (novel) {
      reasons.push({ code: "new_contract", label: "30일 코호트에서 새로 포착된 컨트랙트", points: 12 });
    }
    signals.push(
      makeSignal({
        kind: "contract_convergence",
        key: target,
        date,
        signalClass: "alpha",
        direction: "neutral",
        confidence: "high",
        occurredAt: latestTimestamp(transactions),
        windowHours: 24,
        title: `${targetName ?? `${target.slice(0, 8)}…${target.slice(-6)}`} 컨트랙트 수렴`,
        summary: `${wallets.length}개 지갑이 같은 컨트랙트를 직접 호출했습니다. 새 프로토콜·클레임·포지션 준비 여부를 조사할 후보입니다.`,
        targetAddress: target,
        targetName,
        wallets,
        transactionHashes: transactions.map((transaction) => transaction.transactionHash),
        evidence: [
          `호출 메서드: ${methods.slice(0, 5).join(", ")}`,
          `독립 지갑 ${wallets.length}개`,
          `거래소 코호트 ${exchangeCount}개`,
        ],
        reasons,
      }),
    );
  }
  return signals;
}

function buildWalletBurstSignals(input: {
  activities: ActivityEvent[];
  walletByAddress: Map<string, WalletSeed>;
}) {
  const groups = new Map<string, ActivityEvent[]>();
  for (const activity of input.activities.filter(activityIsMeaningful)) {
    const date = kstDate(activity.occurredAt);
    const key = `${activity.walletAddress}:${date}`;
    const current = groups.get(key) ?? [];
    current.push(activity);
    groups.set(key, current);
  }
  const byWallet = new Map<string, Map<string, ActivityEvent[]>>();
  for (const [key, activities] of groups) {
    const separator = key.lastIndexOf(":");
    const address = key.slice(0, separator);
    const date = key.slice(separator + 1);
    const days = byWallet.get(address) ?? new Map<string, ActivityEvent[]>();
    days.set(date, activities);
    byWallet.set(address, days);
  }

  const signals: IntelligenceSignal[] = [];
  for (const [address, days] of byWallet) {
    const wallet = input.walletByAddress.get(address);
    if (!wallet) continue;
    const dates = [...days.keys()].sort();
    for (let index = 0; index < dates.length; index += 1) {
      const date = dates[index];
      const activities = days.get(date) ?? [];
      if (activities.length < 4) continue;
      const dateTime = Date.parse(`${date}T00:00:00+09:00`);
      const baselineCounts = dates
        .slice(0, index)
        .filter((candidate) => {
          const candidateTime = Date.parse(`${candidate}T00:00:00+09:00`);
          return candidateTime >= dateTime - 7 * DAY_MS;
        })
        .map((candidate) => days.get(candidate)?.length ?? 0);
      const baseline = baselineCounts.length
        ? baselineCounts.reduce((sum, count) => sum + count, 0) / 7
        : 0;
      const ratio = baseline > 0 ? activities.length / baseline : activities.length;
      if (ratio < 3 || activities.length - baseline < 3) continue;
      const reasons: SignalReason[] = [
        { code: "activity_burst", label: "평소 대비 행동 급증", points: 38 },
        {
          code: "event_volume",
          label: `하루 의미 행동 ${activities.length}건`,
          points: Math.min(24, activities.length * 3),
        },
        {
          code: "baseline_ratio",
          label: `7일 일평균 대비 ${ratio.toFixed(1)}배`,
          points: Math.min(20, Math.round(ratio * 3)),
        },
      ];
      if (wallet.inTop100) {
        reasons.push({ code: "top100", label: `거래소 ${wallet.rank}위 지갑`, points: 8 });
      }
      const assets = unique(
        activities
          .map((activity) => activity.primaryAsset?.symbol)
          .filter((symbol): symbol is string => Boolean(symbol)),
      );
      signals.push(
        makeSignal({
          kind: "wallet_activity_burst",
          key: address,
          date,
          signalClass: "anomaly",
          direction: "neutral",
          confidence: "high",
          occurredAt: latestTimestamp(activities),
          windowHours: 24,
          title: `${address.slice(0, 8)}… 지갑 행동 급증`,
          summary: `이 지갑의 의미 있는 행동이 최근 7일 일평균 대비 ${ratio.toFixed(1)}배로 증가했습니다.`,
          asset: activities.find((activity) => activity.primaryAsset)?.primaryAsset ?? null,
          wallets: [
            {
              address,
              exchange: wallet.exchange,
              rank: wallet.rank,
              inTop100: wallet.inTop100,
              activityCount: activities.length,
            },
          ],
          transactionHashes: activities.map((activity) => activity.transactionHash),
          evidence: [
            `당일 의미 행동 ${activities.length}건`,
            `7일 일평균 ${baseline.toFixed(1)}건`,
            `주요 자산 ${assets.slice(0, 5).join(", ") || "컨트랙트 호출"}`,
          ],
          reasons,
        }),
      );
    }
  }
  return signals;
}

function buildBridgeSignals(input: {
  activities: ActivityEvent[];
  walletByAddress: Map<string, WalletSeed>;
}) {
  const byWallet = new Map<string, ActivityEvent[]>();
  for (const activity of input.activities) {
    const current = byWallet.get(activity.walletAddress) ?? [];
    current.push(activity);
    byWallet.set(activity.walletAddress, current);
  }
  const signals: IntelligenceSignal[] = [];
  for (const [address, activities] of byWallet) {
    const wallet = input.walletByAddress.get(address);
    if (!wallet) continue;
    const ordered = [...activities].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const bridge = ordered[index];
      if (bridge.category !== "bridge") continue;
      const followThrough = ordered.slice(index + 1).find((candidate) => {
        const delay = Date.parse(candidate.occurredAt) - Date.parse(bridge.occurredAt);
        return (
          delay >= 0 &&
          delay <= 6 * HOUR_MS &&
          candidate.initiatedByWallet &&
          !candidate.suspectedSpam &&
          [
            "token_buy_candidate",
            "nft_purchase_candidate",
            "nft_mint",
            "staking",
            "liquidity",
            "contract_interaction",
          ].includes(candidate.category)
        );
      });
      if (!followThrough) continue;
      const reasons: SignalReason[] = [
        { code: "bridge_funding", label: "브리지 후 후속 행동", points: 55 },
        { code: "short_sequence", label: "6시간 이내 실행", points: 15 },
        { code: "wallet_initiated", label: "지갑이 직접 시작한 행동", points: 10 },
      ];
      if (wallet.inTop100) {
        reasons.push({ code: "top100", label: `거래소 ${wallet.rank}위 지갑`, points: 8 });
      }
      signals.push(
        makeSignal({
          kind: "bridge_follow_through",
          key: `${address}:${followThrough.transactionHash}`,
          date: kstDate(followThrough.occurredAt),
          signalClass: "alpha",
          direction: "bullish",
          confidence: "high",
          occurredAt: followThrough.occurredAt,
          windowHours: 6,
          title: "브리지 자금 투입 후 후속 행동",
          summary: `브리지 직후 ${followThrough.title} 행동이 이어져 자금 투입 목적을 조사할 가치가 있습니다.`,
          asset: followThrough.primaryAsset,
          wallets: [
            {
              address,
              exchange: wallet.exchange,
              rank: wallet.rank,
              inTop100: wallet.inTop100,
              activityCount: 2,
            },
          ],
          transactionHashes: [bridge.transactionHash, followThrough.transactionHash],
          evidence: [bridge.title, followThrough.title, "두 행동 간격 6시간 이내"],
          reasons,
        }),
      );
    }
  }
  return signals;
}

function buildSignalTrend(signals: IntelligenceSignal[], generatedAt: string): SignalTrendPoint[] {
  const anchor = Date.parse(generatedAt);
  const points = new Map<string, SignalTrendPoint>();
  for (let offset = SIGNAL_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = kstDate(new Date(anchor - offset * DAY_MS).toISOString());
    points.set(date, { date, alpha: 0, anomaly: 0, noise: 0 });
  }
  for (const signal of signals) {
    const point = points.get(kstDate(signal.occurredAt));
    if (point) point[signal.signalClass] += 1;
  }
  return [...points.values()];
}

function buildAssetWatchlist(signals: IntelligenceSignal[], generatedAt: string) {
  const cutoff = Date.parse(generatedAt) - 7 * DAY_MS;
  const rows = new Map<
    string,
    AssetWatchItem & { wallets: Set<string>; exchanges: Set<string>; alphaScore: number; outflowScore: number }
  >();
  for (const signal of signals) {
    const asset = signal.asset;
    if (
      !asset ||
      signal.signalClass === "noise" ||
      Date.parse(signal.occurredAt) < cutoff
    ) {
      continue;
    }
    const key = asset.address.toLowerCase();
    const current = rows.get(key) ?? {
      address: asset.address,
      name: asset.name,
      symbol: asset.symbol,
      type: asset.type,
      score: signal.score,
      direction: signal.direction,
      signalCount: 0,
      walletCount: 0,
      exchangeCount: 0,
      latestSignalAt: signal.occurredAt,
      estimatedUsd: null,
      wallets: new Set<string>(),
      exchanges: new Set<string>(),
      alphaScore: 0,
      outflowScore: 0,
    };
    current.signalCount += 1;
    current.score = Math.max(current.score, signal.score);
    if (Date.parse(signal.occurredAt) > Date.parse(current.latestSignalAt)) {
      current.latestSignalAt = signal.occurredAt;
    }
    if (signal.estimatedUsd !== null && signal.estimatedUsd !== undefined) {
      current.estimatedUsd = (current.estimatedUsd ?? 0) + signal.estimatedUsd;
    }
    for (const wallet of signal.wallets) {
      current.wallets.add(wallet.address);
      current.exchanges.add(wallet.exchange);
    }
    if (signal.direction === "bullish") current.alphaScore += signal.score;
    if (signal.direction === "bearish") current.outflowScore += signal.score;
    rows.set(key, current);
  }
  return [...rows.values()]
    .map((row) => ({
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      type: row.type,
      score: Math.min(100, row.score + Math.min(12, (row.signalCount - 1) * 3)),
      direction:
        row.alphaScore > row.outflowScore
          ? ("bullish" as const)
          : row.outflowScore > row.alphaScore
            ? ("bearish" as const)
            : ("neutral" as const),
      signalCount: row.signalCount,
      walletCount: row.wallets.size,
      exchangeCount: row.exchanges.size,
      latestSignalAt: row.latestSignalAt,
      estimatedUsd: row.estimatedUsd,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.walletCount - a.walletCount ||
        Date.parse(b.latestSignalAt) - Date.parse(a.latestSignalAt),
    )
    .slice(0, 24);
}

export function buildIntelligence(input: {
  wallets: WalletSeed[];
  activities: ActivityEvent[];
  transfers?: NormalizedTransfer[];
  transactions?: NormalizedTransaction[];
  generatedAt: string;
  completeHistory?: boolean;
}): IntelligenceResult {
  const generatedTime = Date.parse(input.generatedAt);
  const cutoff30d = generatedTime - SIGNAL_WINDOW_DAYS * DAY_MS;
  const activities = input.activities.filter(
    (activity) => Date.parse(activity.occurredAt) >= cutoff30d,
  );
  const transfers = (input.transfers ?? []).filter(
    (transfer) => Date.parse(transfer.occurredAt) >= cutoff30d,
  );
  const transactions = (input.transactions ?? []).filter(
    (transaction) => Date.parse(transaction.occurredAt) >= cutoff30d,
  );
  const walletByAddress = new Map(
    input.wallets.map((wallet) => [wallet.address.toLowerCase(), wallet]),
  );
  const hotWallets = new Set(
    input.wallets.flatMap((wallet) => wallet.targetHotWallets.map((address) => address.toLowerCase())),
  );

  const cohortTrades = buildCohortTradeSignals({ activities, walletByAddress });
  const rawSignals = [
    ...cohortTrades.signals,
    ...buildAssetFlowSignals({
      transfers,
      transactions,
      walletByAddress,
      hotWallets,
      confirmedTradeAssetDates: cohortTrades.assetDates,
    }),
    ...buildContractSignals({ transactions, walletByAddress }),
    ...(input.completeHistory === false
      ? []
      : buildWalletBurstSignals({ activities, walletByAddress })),
    ...buildBridgeSignals({ activities, walletByAddress }),
  ];
  const byId = new Map<string, IntelligenceSignal>();
  for (const signal of rawSignals) {
    const existing = byId.get(signal.id);
    if (!existing || signal.score > existing.score) byId.set(signal.id, signal);
  }
  const allSignals = [...byId.values()].sort(
    (a, b) =>
      Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
  const signals = allSignals
    .slice(0, SIGNAL_LIMIT);

  const cutoff24h = generatedTime - DAY_MS;
  const cutoff7d = generatedTime - 7 * DAY_MS;
  const recent24h = allSignals.filter((signal) => Date.parse(signal.occurredAt) >= cutoff24h);
  const recent7d = allSignals.filter((signal) => Date.parse(signal.occurredAt) >= cutoff7d);
  const activities24h = activities.filter(
    (activity) => Date.parse(activity.occurredAt) >= cutoff24h,
  );
  const meaningfulActivities24h = activities24h.filter(activityIsMeaningful).length;
  const actionableSignals24h = recent24h.filter(
    (signal) =>
      signal.signalClass !== "noise" && signal.score >= ACTIONABLE_SIGNAL_SCORE,
  ).length;
  const signalAssets7d = new Set(
    recent7d
      .filter((signal) => signal.signalClass !== "noise" && signal.asset)
      .map((signal) => signal.asset?.address.toLowerCase()),
  ).size;

  const walletSignals = new Map<string, WalletSignalSummary>();
  for (const wallet of input.wallets) {
    const address = wallet.address.toLowerCase();
    const related24h = recent24h.filter(
      (signal) =>
        signal.signalClass !== "noise" &&
        signal.wallets.some((item) => item.address === address),
    );
    const related7d = recent7d.filter(
      (signal) =>
        signal.signalClass !== "noise" &&
        signal.wallets.some((item) => item.address === address),
    );
    walletSignals.set(address, {
      signalCount24h: related24h.length,
      signalCount7d: related7d.length,
      maxSignalScore: Math.max(0, ...related7d.map((signal) => signal.score)),
    });
  }

  return {
    signals,
    signalTrend: buildSignalTrend(allSignals, input.generatedAt),
    assetWatchlist: buildAssetWatchlist(allSignals, input.generatedAt),
    metrics: {
      actionableSignals24h,
      alphaSignals7d: recent7d.filter((signal) => signal.signalClass === "alpha").length,
      highAnomalies24h: recent24h.filter(
        (signal) =>
          signal.signalClass === "anomaly" && signal.score >= ACTIONABLE_SIGNAL_SCORE,
      ).length,
      noiseSignals24h: recent24h.filter((signal) => signal.signalClass === "noise").length,
      meaningfulActivities24h,
      noiseFilteredActivities24h: Math.max(0, activities24h.length - meaningfulActivities24h),
      signalAssets7d,
    },
    walletSignals,
  };
}
