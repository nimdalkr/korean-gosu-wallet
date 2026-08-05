export type Exchange = "Upbit" | "Bithumb";

export type TokenType = "ERC-20" | "ERC-721" | "ERC-1155" | "NATIVE";

export type Direction = "in" | "out";

export type ActivityCategory =
  | "airdrop_received"
  | "token_buy_candidate"
  | "token_sell_candidate"
  | "nft_purchase_candidate"
  | "nft_sale_candidate"
  | "nft_mint"
  | "token_receive"
  | "token_send"
  | "nft_receive"
  | "nft_send"
  | "bridge"
  | "staking"
  | "liquidity"
  | "approval"
  | "contract_interaction";

export type Confidence = "confirmed" | "high" | "medium" | "low";

export interface WalletSeed {
  address: string;
  exchange: Exchange;
  rank: number;
  depositAmountQuid: string;
  depositTransferCount: number;
  firstDepositAt: string;
  lastDepositAt: string;
  targetHotWallets: string[];
  inTop100: boolean;
}

export interface WalletSeedSummary {
  walletRows: number;
  uniqueAddressCount: number;
  overlappingAddressCount: number;
  overlappingAddresses: string[];
  allSenders: {
    uniqueAddressCount: number;
    overlappingAddressCount: number;
    overlappingAddresses: string[];
    internalKnownSenderCount: number;
    internalKnownSenderAddresses: string[];
    byExchange: Record<Exchange, { walletCount: number }>;
  };
  byExchange: Record<
    Exchange,
    {
      walletCount: number;
      top100Count: number;
      depositTransferCount: number;
      depositAmountQuid: string;
    }
  >;
}

export interface WalletSeedDocument {
  summary: WalletSeedSummary;
  wallets: WalletSeed[];
}

export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number | null;
  type: TokenType;
  iconUrl?: string | null;
  reputation?: string | null;
  exchangeRateUsd?: string | null;
  holdersCount?: number | null;
  circulatingMarketCapUsd?: string | null;
  totalSupply?: string | null;
}

export interface NormalizedTransfer {
  id: string;
  walletAddress: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  occurredAt: string;
  direction: Direction;
  from: string;
  to: string;
  token: TokenMetadata;
  amount: string;
  rawAmount: string;
  tokenId?: string | null;
  batchIndex?: number | null;
  method?: string | null;
}

export interface NormalizedTransaction {
  id: string;
  walletAddress: string;
  transactionHash: string;
  blockNumber: number;
  occurredAt: string;
  direction: Direction;
  from: string;
  to: string | null;
  method?: string | null;
  valueEth: string;
  status: "ok" | "error" | "unknown";
  source?: "normal" | "internal";
  toName?: string | null;
  toIsContract?: boolean | null;
  transactionTypes?: string[];
}

export interface ActivityAsset {
  address: string;
  name: string;
  symbol: string;
  type: TokenType;
  amount?: string;
  tokenId?: string | null;
}

export interface ActivityEvent {
  id: string;
  walletAddress: string;
  exchange: Exchange;
  transactionHash: string;
  blockNumber: number;
  occurredAt: string;
  category: ActivityCategory;
  confidence: Confidence;
  title: string;
  description: string;
  method?: string | null;
  primaryAsset?: ActivityAsset | null;
  counterAsset?: ActivityAsset | null;
  evidence: string[];
  basescanUrl: string;
  initiatedByWallet: boolean;
  suspectedSpam: boolean;
}

export interface WalletActivitySummary extends WalletSeed {
  eventCount24h: number;
  eventCount7d: number;
  eventCount30d: number;
  signalCount24h: number;
  signalCount7d: number;
  maxSignalScore: number;
  lastActivityAt: string | null;
  topCategories: ActivityCategory[];
  topAssets: string[];
}

export type SignalClass = "alpha" | "anomaly" | "noise";

export type SignalDirection = "bullish" | "bearish" | "neutral";

export type SignalSeverity = "critical" | "high" | "medium" | "low";

export type SignalKind =
  | "cohort_trade"
  | "cohort_accumulation"
  | "coordinated_outflow"
  | "distribution_blast"
  | "wallet_activity_burst"
  | "contract_convergence"
  | "bridge_follow_through";

export interface SignalReason {
  code: string;
  label: string;
  points: number;
}

export interface SignalWallet {
  address: string;
  exchange: Exchange;
  rank: number;
  inTop100: boolean;
  activityCount: number;
}

export interface IntelligenceSignal {
  id: string;
  kind: SignalKind;
  signalClass: SignalClass;
  direction: SignalDirection;
  severity: SignalSeverity;
  score: number;
  confidence: Confidence;
  occurredAt: string;
  windowHours: number;
  title: string;
  summary: string;
  asset?: ActivityAsset | null;
  targetAddress?: string | null;
  targetName?: string | null;
  wallets: SignalWallet[];
  exchangeCount: number;
  transactionHashes: string[];
  basescanUrls: string[];
  evidence: string[];
  reasons: SignalReason[];
  noiseCandidate: boolean;
  estimatedUsd?: number | null;
}

export interface SignalTrendPoint {
  date: string;
  alpha: number;
  anomaly: number;
  noise: number;
}

export interface AssetWatchItem {
  address: string;
  name: string;
  symbol: string;
  type: TokenType;
  score: number;
  direction: SignalDirection;
  signalCount: number;
  walletCount: number;
  exchangeCount: number;
  latestSignalAt: string;
  estimatedUsd?: number | null;
}

export type WalletPersona =
  | "active_trader"
  | "token_operator"
  | "defi_operator"
  | "protocol_explorer"
  | "nft_collector"
  | "airdrop_hunter"
  | "accumulator"
  | "distributor"
  | "exchange_feeder"
  | "multi_strategy"
  | "passive_holder";

export type WalletMomentum =
  | "surging"
  | "rising"
  | "stable"
  | "cooling"
  | "inactive";

export type WalletStance =
  | "accumulating"
  | "distributing"
  | "rotating"
  | "exploring"
  | "monitoring"
  | "inactive";

export type ResearchConfidence = "high" | "medium" | "low";

export interface WalletInterestTopic {
  key: string;
  label: string;
  kind: "sector" | "asset" | "protocol" | "nft";
  score: number;
  share: number;
  activityCount30d: number;
  activityCount7d: number;
  initiatedCount30d: number;
  lastSeenAt: string;
  address?: string | null;
}

export interface WalletAssetFlow {
  address: string;
  name: string;
  symbol: string;
  type: TokenType;
  sector: string;
  receivedAmount: number;
  sentAmount: number;
  netAmount: number;
  transferCount30d: number;
  transferCount7d: number;
  initiatedActivityCount: number;
  lastSeenAt: string;
  estimatedReceivedUsd?: number | null;
  estimatedSentUsd?: number | null;
  estimatedNetUsd?: number | null;
  pricingCoverage: "priced" | "unpriced";
  passiveDistribution: boolean;
}

export interface WalletProtocolInterest {
  address: string;
  name: string;
  sector: string;
  interactionCount30d: number;
  interactionCount7d: number;
  uniqueMethods: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  isNew7d: boolean;
}

export interface WalletCounterparty {
  address: string;
  label: string;
  relationship: "exchange" | "cohort" | "contract" | "external";
  inboundCount: number;
  outboundCount: number;
  assetCount: number;
  interactionCount30d: number;
  interactionCount7d: number;
  lastSeenAt: string;
  estimatedUsd?: number | null;
}

export interface WalletTrendPoint {
  date: string;
  meaningful: number;
  initiated: number;
  inbound: number;
  outbound: number;
}

export interface WalletBehaviorSlice {
  category: ActivityCategory;
  count30d: number;
  count7d: number;
  initiatedCount30d: number;
  share: number;
  lastSeenAt: string;
}

export interface WalletNotableMove {
  id: string;
  occurredAt: string;
  category: ActivityCategory;
  title: string;
  description: string;
  whyItMatters: string;
  importanceScore: number;
  confidence: Confidence;
  asset?: ActivityAsset | null;
  counterparty?: string | null;
  method?: string | null;
  estimatedUsd?: number | null;
  basescanUrl: string;
}

export interface WalletResearchProfile {
  address: string;
  persona: WalletPersona;
  personaLabel: string;
  secondaryTags: string[];
  headline: string;
  analystView: string;
  recentChange: string;
  momentum: WalletMomentum;
  momentumRatio: number | null;
  stance: WalletStance;
  researchPriority: number;
  agencyScore: number;
  sophisticationScore: number;
  evidenceConfidence: ResearchConfidence;
  evidenceCount: number;
  activeDays30d: number;
  activeDays7d: number;
  meaningfulActions30d: number;
  meaningfulActions7d: number;
  initiatedTransactions30d: number;
  initiatedShare: number;
  uniqueAssets30d: number;
  uniqueProtocols30d: number;
  uniqueCounterparties30d: number;
  knownFlowUsd30d: number | null;
  pricingCoverage: number;
  primarySector: string;
  behaviorMix: WalletBehaviorSlice[];
  interests: WalletInterestTopic[];
  assetFlows: WalletAssetFlow[];
  protocols: WalletProtocolInterest[];
  counterparties: WalletCounterparty[];
  trend14d: WalletTrendPoint[];
  notableMoves: WalletNotableMove[];
  watchpoints: string[];
  flags: string[];
  latestActivityAt: string | null;
}

export type CohortThemeStatus =
  | "emerging"
  | "accelerating"
  | "accumulating"
  | "distributing"
  | "fading"
  | "passive_noise";

export interface CohortTheme {
  id: string;
  kind: "asset" | "protocol" | "sector";
  label: string;
  sublabel: string;
  address?: string | null;
  sector: string;
  status: CohortThemeStatus;
  score: number;
  confidence: ResearchConfidence;
  walletCount7d: number;
  walletCount30d: number;
  initiatedWalletCount7d: number;
  top100WalletCount7d: number;
  exchangeCount7d: number;
  actionCount7d: number;
  priorDailyBaseline: number;
  recentDailyRate: number;
  acceleration: number | null;
  inboundCount7d: number;
  outboundCount7d: number;
  estimatedNetUsd7d?: number | null;
  topWallets: string[];
  thesis: string;
  caveat: string;
  evidenceUrls: string[];
  lastSeenAt: string;
}

export interface WalletStrategyCluster {
  id: WalletPersona;
  label: string;
  description: string;
  walletCount: number;
  walletShare: number;
  upbitWallets: number;
  bithumbWallets: number;
  activeWallets7d: number;
  averagePriority: number;
  averageAgency: number;
  topSectors: string[];
  topAssets: string[];
  representativeWallets: string[];
}

export interface AnalystBriefFinding {
  id: string;
  title: string;
  body: string;
  implication: string;
  confidence: ResearchConfidence;
  walletAddresses: string[];
  evidenceUrls: string[];
}

export interface AnalystBrief {
  asOf: string;
  title: string;
  headline: string;
  executiveSummary: string[];
  keyFindings: AnalystBriefFinding[];
  priorityWallets: string[];
  nextChecks: string[];
  caveats: string[];
}

export interface WalletResearchDesk {
  methodologyVersion: 1;
  brief: AnalystBrief;
  walletProfiles: WalletResearchProfile[];
  themes: CohortTheme[];
  strategyClusters: WalletStrategyCluster[];
  metrics: {
    highPriorityWallets: number;
    highAgencyWallets: number;
    surgingWallets: number;
    activeThemes7d: number;
    crossExchangeThemes7d: number;
    newlyExploredProtocols7d: number;
    pricedFlowCoverage: number;
  };
}

export type WalletResearchProfileSummary = Pick<
  WalletResearchProfile,
  | "address"
  | "persona"
  | "personaLabel"
  | "secondaryTags"
  | "headline"
  | "recentChange"
  | "momentum"
  | "stance"
  | "researchPriority"
  | "agencyScore"
  | "sophisticationScore"
  | "evidenceConfidence"
  | "meaningfulActions7d"
  | "primarySector"
  | "interests"
  | "latestActivityAt"
>;

export type WalletResearchDeskSummary = Omit<WalletResearchDesk, "walletProfiles"> & {
  walletProfiles: WalletResearchProfileSummary[];
};

export interface DailyActivityPoint {
  date: string;
  total: number;
  token: number;
  nft: number;
  defi: number;
  other: number;
}

export interface RankedActivityItem {
  key: string;
  label: string;
  sublabel?: string;
  count: number;
  category?: ActivityCategory;
  address?: string;
}

export interface DashboardSnapshot {
  schemaVersion: 3;
  generatedAt: string;
  source: {
    chain: "Base";
    chainId: 8453;
    mode: "bootstrap" | "incremental" | "seed-only";
    fromBlock: number | null;
    toBlock: number | null;
    trackingWindowDays: number;
    degraded: boolean;
    warnings: string[];
    failedWallets: string[];
    refreshScope: "all" | "top100";
    refreshedWalletCount: number;
  };
  coverage: {
    trackedWallets: number;
    upbitWallets: number;
    bithumbWallets: number;
    crossExchangeOverlap: number;
    top100Wallets: number;
    depositSenderWallets: number;
    upbitDepositSenders: number;
    bithumbDepositSenders: number;
    internalWalletsExcluded: number;
  };
  metrics: {
    activeWallets24h: number;
    activeWallets7d: number;
    activities24h: number;
    activities7d: number;
    inferredBuys30d: number;
    nftActivities30d: number;
    airdrops30d: number;
    activities30d: number;
    activityRowsIncluded: number;
    actionableSignals24h: number;
    alphaSignals7d: number;
    highAnomalies24h: number;
    noiseSignals24h: number;
    meaningfulActivities24h: number;
    noiseFilteredActivities24h: number;
    signalAssets7d: number;
  };
  wallets: WalletActivitySummary[];
  activities: ActivityEvent[];
  signals: IntelligenceSignal[];
  signalTrend: SignalTrendPoint[];
  assetWatchlist: AssetWatchItem[];
  research: WalletResearchDesk;
  dailyActivity: DailyActivityPoint[];
  topTokens: RankedActivityItem[];
  topNfts: RankedActivityItem[];
  categoryBreakdown: RankedActivityItem[];
}

export interface WalletFeedCursor {
  tokenTransfersUpdatedAt: string | null;
  normalTransactionsUpdatedAt: string | null;
  internalTransactionsUpdatedAt: string | null;
}

export interface TrackerState {
  schemaVersion: 3;
  updatedAt: string;
  lastProcessedBlock: number | null;
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  tokenMetadata: Record<string, TokenMetadata>;
  cursors: Record<string, WalletFeedCursor>;
  deliveredSignalIds: Record<string, string>;
}
