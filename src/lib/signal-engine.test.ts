import { describe, expect, it } from "vitest";
import type {
  ActivityEvent,
  Exchange,
  NormalizedTransaction,
  NormalizedTransfer,
  TokenMetadata,
  WalletSeed,
} from "./domain";
import { ACTIONABLE_SIGNAL_SCORE, buildIntelligence } from "./signal-engine";

const generatedAt = "2026-08-05T12:00:00.000Z";
const asset: TokenMetadata = {
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Alpha Asset",
  symbol: "ALPHA",
  decimals: 18,
  type: "ERC-20",
  exchangeRateUsd: "2",
};
const quid: TokenMetadata = {
  ...asset,
  address: "0x1a44233fae8d50f1aeb3a5d58dd426ff4814cb53",
  name: "Squid",
  symbol: "QUID",
};

function wallet(index: number, exchange: Exchange = index % 2 ? "Upbit" : "Bithumb"): WalletSeed {
  return {
    address: `0x${index.toString(16).padStart(40, "0")}`,
    exchange,
    rank: index,
    depositAmountQuid: "100",
    depositTransferCount: 1,
    firstDepositAt: "2026-08-01T00:00:00.000Z",
    lastDepositAt: "2026-08-01T00:00:00.000Z",
    targetHotWallets: ["0xffffffffffffffffffffffffffffffffffffffff"],
    inTop100: true,
  };
}

function activity(input: {
  wallet: WalletSeed;
  token?: TokenMetadata;
  index: number;
}): ActivityEvent {
  const transactionHash = `0x${input.index.toString(16).padStart(64, "0")}`;
  return {
    id: `${input.wallet.address}:${transactionHash}:token_buy_candidate`,
    walletAddress: input.wallet.address,
    exchange: input.wallet.exchange,
    transactionHash,
    blockNumber: 100 + input.index,
    occurredAt: `2026-08-05T10:${String(input.index).padStart(2, "0")}:00.000Z`,
    category: "token_buy_candidate",
    confidence: "medium",
    title: `${input.token?.symbol ?? asset.symbol} 매수 추정`,
    description: "결제 자산 유출과 자산 유입이 함께 확인됨",
    method: "swap",
    primaryAsset: {
      ...(input.token ?? asset),
      amount: "10",
    },
    counterAsset: null,
    evidence: ["USDC 유출", "토큰 유입"],
    basescanUrl: `https://basescan.org/tx/${transactionHash}`,
    initiatedByWallet: true,
    suspectedSpam: false,
  };
}

function transfer(input: {
  wallet: WalletSeed;
  index: number;
  direction?: "in" | "out";
  from?: string;
  to?: string;
  token?: TokenMetadata;
}): NormalizedTransfer {
  const direction = input.direction ?? "in";
  const transactionHash = `0x${(100 + input.index).toString(16).padStart(64, "0")}`;
  const counterparty = `0x${(500 + input.index).toString(16).padStart(40, "0")}`;
  return {
    id: `${input.wallet.address}:${transactionHash}:1`,
    walletAddress: input.wallet.address,
    transactionHash,
    logIndex: 1,
    blockNumber: 1_000 + input.index,
    occurredAt: `2026-08-05T09:${String(input.index).padStart(2, "0")}:00.000Z`,
    direction,
    from: input.from ?? (direction === "in" ? counterparty : input.wallet.address),
    to: input.to ?? (direction === "in" ? input.wallet.address : counterparty),
    token: input.token ?? asset,
    amount: "100",
    rawAmount: "100000000000000000000",
    tokenId: null,
    method: "swap",
  };
}

function transaction(item: NormalizedTransfer): NormalizedTransaction {
  return {
    id: `${item.walletAddress}:${item.transactionHash}`,
    walletAddress: item.walletAddress,
    transactionHash: item.transactionHash,
    blockNumber: item.blockNumber,
    occurredAt: item.occurredAt,
    direction: "out",
    from: item.walletAddress,
    to: item.from,
    method: "swap",
    valueEth: "0",
    status: "ok",
    source: "normal",
    toIsContract: true,
  };
}

describe("buildIntelligence", () => {
  it("promotes cross-exchange cohort buys into an actionable alpha signal", () => {
    const wallets = [wallet(1, "Upbit"), wallet(2, "Bithumb")];
    const result = buildIntelligence({
      wallets,
      activities: wallets.map((item, index) => activity({ wallet: item, index: index + 1 })),
      generatedAt,
    });
    const signal = result.signals.find((item) => item.kind === "cohort_trade");
    expect(signal?.signalClass).toBe("alpha");
    expect(signal?.exchangeCount).toBe(2);
    expect(signal?.score).toBeGreaterThanOrEqual(ACTIONABLE_SIGNAL_SCORE);
    expect(result.metrics.actionableSignals24h).toBe(1);
  });

  it("classifies identical passive mass receipts as noise, not accumulation", () => {
    const wallets = Array.from({ length: 6 }, (_, index) => wallet(index + 1));
    const distributor = "0xdddddddddddddddddddddddddddddddddddddddd";
    const transfers = wallets.map((item, index) =>
      transfer({ wallet: item, index: index + 1, from: distributor }),
    );
    const result = buildIntelligence({ wallets, activities: [], transfers, generatedAt });
    expect(result.signals.some((item) => item.kind === "distribution_blast")).toBe(true);
    expect(result.signals.some((item) => item.kind === "cohort_accumulation")).toBe(false);
    expect(result.metrics.actionableSignals24h).toBe(0);
  });

  it("scores initiated, retained cross-exchange inflows as accumulation", () => {
    const wallets = [wallet(1, "Upbit"), wallet(2, "Bithumb")];
    const transfers = wallets.map((item, index) =>
      transfer({ wallet: item, index: index + 1 }),
    );
    const result = buildIntelligence({
      wallets,
      activities: [],
      transfers,
      transactions: transfers.map(transaction),
      generatedAt,
    });
    const signal = result.signals.find((item) => item.kind === "cohort_accumulation");
    expect(signal?.score).toBeGreaterThanOrEqual(ACTIONABLE_SIGNAL_SCORE);
    expect(signal?.reasons.map((reason) => reason.code)).toContain("wallet_initiated");
    expect(result.assetWatchlist[0]?.symbol).toBe("ALPHA");
  });

  it("never promotes the cohort-defining QUID token into an alpha signal", () => {
    const wallets = [wallet(1, "Upbit"), wallet(2, "Bithumb")];
    const activities = wallets.map((item, index) =>
      activity({ wallet: item, index: index + 1, token: quid }),
    );
    const result = buildIntelligence({ wallets, activities, generatedAt });
    expect(result.signals).toEqual([]);
    expect(result.metrics.meaningfulActivities24h).toBe(0);
  });
});
