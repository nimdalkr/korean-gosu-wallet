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
  lastActivityAt: string | null;
  topCategories: ActivityCategory[];
  topAssets: string[];
}

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
  schemaVersion: 1;
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
  };
  wallets: WalletActivitySummary[];
  activities: ActivityEvent[];
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
  schemaVersion: 2;
  updatedAt: string;
  lastProcessedBlock: number | null;
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  tokenMetadata: Record<string, TokenMetadata>;
  cursors: Record<string, WalletFeedCursor>;
}
