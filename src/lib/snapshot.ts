import type {
  ActivityCategory,
  ActivityEvent,
  DailyActivityPoint,
  DashboardSnapshot,
  RankedActivityItem,
  WalletActivitySummary,
  WalletSeed,
  WalletSeedSummary,
} from "./domain";

const DAY_MS = 86_400_000;
const ACTIVITY_ROW_LIMIT = 750;

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  airdrop_received: "에어드롭 수신",
  token_buy_candidate: "토큰 매수 추정",
  token_sell_candidate: "토큰 매도 추정",
  nft_purchase_candidate: "NFT 매수 추정",
  nft_sale_candidate: "NFT 매도 추정",
  nft_mint: "NFT 민팅",
  token_receive: "토큰 수신",
  token_send: "토큰 전송",
  nft_receive: "NFT 수신",
  nft_send: "NFT 전송",
  bridge: "브리지",
  staking: "스테이킹",
  liquidity: "유동성",
  approval: "승인",
  contract_interaction: "컨트랙트 호출",
};

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function kstDate(isoTimestamp: string) {
  return KST_DATE_FORMATTER.format(new Date(isoTimestamp));
}

function isAfter(timestamp: string, threshold: number) {
  return Date.parse(timestamp) >= threshold;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topKeys<T extends string>(values: T[], count: number): T[] {
  const frequencies = new Map<T, number>();
  for (const value of values) {
    frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  }
  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([key]) => key);
}

function activityBucket(category: ActivityCategory) {
  if (category.startsWith("nft_")) return "nft" as const;
  if (category.startsWith("token_") || category === "airdrop_received") return "token" as const;
  if (["bridge", "staking", "liquidity"].includes(category)) {
    return "defi" as const;
  }
  return "other" as const;
}

function buildDailyActivity(
  activities: ActivityEvent[],
  generatedAt: string,
  days: number,
): DailyActivityPoint[] {
  const byDate = new Map<string, DailyActivityPoint>();
  const anchor = Date.parse(generatedAt);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = kstDate(new Date(anchor - offset * DAY_MS).toISOString());
    byDate.set(date, { date, total: 0, token: 0, nft: 0, defi: 0, other: 0 });
  }

  for (const activity of activities) {
    const date = kstDate(activity.occurredAt);
    const point = byDate.get(date);
    if (!point) continue;
    point.total += 1;
    point[activityBucket(activity.category)] += 1;
  }

  return [...byDate.values()];
}

function rankedAssets(
  activities: ActivityEvent[],
  predicate: (activity: ActivityEvent) => boolean,
  limit: number,
): RankedActivityItem[] {
  const counts = new Map<string, RankedActivityItem>();
  for (const activity of activities.filter(predicate)) {
    const asset = activity.primaryAsset;
    if (!asset) continue;
    const key = asset.address.toLowerCase();
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        key,
        label: asset.symbol || asset.name,
        sublabel: asset.name,
        count: 1,
        category: activity.category,
        address: asset.address,
      });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function buildDashboardSnapshot(input: {
  wallets: WalletSeed[];
  cohort: WalletSeedSummary;
  activities: ActivityEvent[];
  generatedAt: string;
  mode: DashboardSnapshot["source"]["mode"];
  fromBlock: number | null;
  toBlock: number | null;
  trackingWindowDays: number;
  warnings?: string[];
  failedWallets?: string[];
}): DashboardSnapshot {
  const generatedTime = Date.parse(input.generatedAt);
  const threshold24h = generatedTime - DAY_MS;
  const threshold7d = generatedTime - 7 * DAY_MS;
  const threshold30d = generatedTime - 30 * DAY_MS;
  const activities30d = input.activities.filter((activity) =>
    isAfter(activity.occurredAt, threshold30d),
  );
  const initiatedActivities30d = activities30d.filter(
    (activity) => activity.initiatedByWallet && !activity.suspectedSpam,
  );
  const activitiesByWallet = new Map<string, ActivityEvent[]>();

  for (const activity of activities30d) {
    const key = activity.walletAddress.toLowerCase();
    const current = activitiesByWallet.get(key) ?? [];
    current.push(activity);
    activitiesByWallet.set(key, current);
  }

  const wallets: WalletActivitySummary[] = input.wallets.map((wallet) => {
    const walletActivities = activitiesByWallet.get(wallet.address.toLowerCase()) ?? [];
    return {
      ...wallet,
      eventCount24h: walletActivities.filter((activity) =>
        isAfter(activity.occurredAt, threshold24h),
      ).length,
      eventCount7d: walletActivities.filter((activity) =>
        isAfter(activity.occurredAt, threshold7d),
      ).length,
      eventCount30d: walletActivities.length,
      lastActivityAt: walletActivities[0]?.occurredAt ?? null,
      topCategories: topKeys(
        walletActivities.map((activity) => activity.category),
        3,
      ),
      topAssets: topKeys(
        walletActivities
          .filter((activity) => activity.initiatedByWallet && !activity.suspectedSpam)
          .map((activity) => activity.primaryAsset?.symbol)
          .filter((symbol): symbol is string => Boolean(symbol)),
        3,
      ),
    };
  });

  const categoryCounts = new Map<string, number>();
  for (const activity of activities30d) increment(categoryCounts, activity.category);

  const categoryBreakdown: RankedActivityItem[] = [...categoryCounts.entries()]
    .map(([category, count]) => ({
      key: category,
      label: CATEGORY_LABELS[category as ActivityCategory],
      count,
      category: category as ActivityCategory,
    }))
    .sort((a, b) => b.count - a.count);

  const activityRows = activities30d.slice(0, ACTIVITY_ROW_LIMIT);

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    source: {
      chain: "Base",
      chainId: 8453,
      mode: input.mode,
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      trackingWindowDays: input.trackingWindowDays,
      degraded: Boolean(input.failedWallets?.length || input.warnings?.length),
      warnings: input.warnings ?? [],
      failedWallets: input.failedWallets ?? [],
    },
    coverage: {
      trackedWallets: wallets.length,
      upbitWallets: wallets.filter((wallet) => wallet.exchange === "Upbit").length,
      bithumbWallets: wallets.filter((wallet) => wallet.exchange === "Bithumb").length,
      crossExchangeOverlap: input.cohort.allSenders.overlappingAddressCount,
      top100Wallets: wallets.filter((wallet) => wallet.inTop100).length,
      depositSenderWallets: input.cohort.allSenders.uniqueAddressCount,
      upbitDepositSenders: input.cohort.allSenders.byExchange.Upbit.walletCount,
      bithumbDepositSenders: input.cohort.allSenders.byExchange.Bithumb.walletCount,
      internalWalletsExcluded: input.cohort.allSenders.internalKnownSenderCount,
    },
    metrics: {
      activeWallets24h: new Set(
        initiatedActivities30d
          .filter((activity) => isAfter(activity.occurredAt, threshold24h))
          .map((activity) => activity.walletAddress),
      ).size,
      activeWallets7d: new Set(
        initiatedActivities30d
          .filter((activity) => isAfter(activity.occurredAt, threshold7d))
          .map((activity) => activity.walletAddress),
      ).size,
      activities24h: activities30d.filter((activity) =>
        isAfter(activity.occurredAt, threshold24h),
      ).length,
      activities7d: activities30d.filter((activity) =>
        isAfter(activity.occurredAt, threshold7d),
      ).length,
      inferredBuys30d: activities30d.filter((activity) =>
        ["token_buy_candidate", "nft_purchase_candidate"].includes(activity.category),
      ).length,
      nftActivities30d: activities30d.filter((activity) =>
        activity.category.startsWith("nft_"),
      ).length,
      airdrops30d: activities30d.filter(
        (activity) => activity.category === "airdrop_received",
      ).length,
      activities30d: activities30d.length,
      activityRowsIncluded: activityRows.length,
    },
    wallets,
    activities: activityRows,
    dailyActivity: buildDailyActivity(activities30d, input.generatedAt, 30),
    topTokens: rankedAssets(
      activities30d,
      (activity) => activity.category === "token_buy_candidate" && !activity.suspectedSpam,
      10,
    ),
    topNfts: rankedAssets(
      activities30d,
      (activity) => activity.category.startsWith("nft_") && !activity.suspectedSpam,
      10,
    ),
    categoryBreakdown,
  };
}

export { CATEGORY_LABELS };
