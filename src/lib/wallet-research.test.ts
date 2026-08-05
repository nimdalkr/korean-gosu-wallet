import { describe, expect, it } from "vitest";
import type {
  ActivityEvent,
  Exchange,
  IntelligenceSignal,
  NormalizedTransaction,
  NormalizedTransfer,
  TokenMetadata,
  WalletSeed,
} from "./domain";
import { buildWalletResearch } from "./wallet-research";

const generatedAt = "2026-08-05T12:00:00.000Z";
const hotWallet = "0xffffffffffffffffffffffffffffffffffffffff";
const quid: TokenMetadata = {
  address: "0x1a44233fae8d50f1aeb3a5d58dd426ff4814cb53",
  name: "Squid",
  symbol: "QUID",
  decimals: 18,
  type: "ERC-20",
};
const kaito: TokenMetadata = {
  address: "0x98d0baa52b2d063e780de12f615f963fe8537553",
  name: "KAITO",
  symbol: "KAITO",
  decimals: 18,
  type: "ERC-20",
  reputation: "ok",
  exchangeRateUsd: "1.2",
};

function wallet(index: number, exchange: Exchange = index % 2 ? "Upbit" : "Bithumb"): WalletSeed {
  return {
    address: `0x${index.toString(16).padStart(40, "0")}`,
    exchange,
    rank: index,
    depositAmountQuid: "1000",
    depositTransferCount: 1,
    firstDepositAt: "2026-08-01T00:00:00.000Z",
    lastDepositAt: "2026-08-01T00:00:00.000Z",
    targetHotWallets: [hotWallet],
    inTop100: true,
  };
}

function transfer(input: {
  wallet: WalletSeed;
  token?: TokenMetadata;
  index: number;
  direction?: "in" | "out";
  from?: string;
  to?: string;
  amount?: string;
}): NormalizedTransfer {
  const direction = input.direction ?? "in";
  const token = input.token ?? kaito;
  const transactionHash = `0x${(100 + input.index).toString(16).padStart(64, "0")}`;
  const counterparty = `0x${(500 + input.index).toString(16).padStart(40, "0")}`;
  return {
    id: `${input.wallet.address}:${transactionHash}:1:${token.address}`,
    walletAddress: input.wallet.address,
    transactionHash,
    logIndex: 1,
    blockNumber: 1_000 + input.index,
    occurredAt: `2026-08-05T0${Math.min(9, input.index)}:00:00.000Z`,
    direction,
    from: input.from ?? (direction === "in" ? counterparty : input.wallet.address),
    to: input.to ?? (direction === "in" ? input.wallet.address : counterparty),
    token,
    amount: input.amount ?? "100",
    rawAmount: "100000000000000000000",
    tokenId: null,
    method: "transfer",
  };
}

function transaction(input: {
  wallet: WalletSeed;
  index: number;
  to?: string;
  method?: string;
}): NormalizedTransaction {
  return {
    id: `${input.wallet.address}:tx:${input.index}`,
    walletAddress: input.wallet.address,
    transactionHash: `0x${(100 + input.index).toString(16).padStart(64, "0")}`,
    blockNumber: 1_000 + input.index,
    occurredAt: `2026-08-05T0${Math.min(9, input.index)}:00:00.000Z`,
    direction: "out",
    from: input.wallet.address,
    to: input.to ?? "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    method: input.method ?? "swap",
    valueEth: "0",
    status: "ok",
    source: "normal",
    toName: "Alpha Router",
    toIsContract: true,
    transactionTypes: ["contract_call", "token_transfer"],
  };
}

function activity(input: {
  wallet: WalletSeed;
  index: number;
  token?: TokenMetadata;
  category?: ActivityEvent["category"];
}): ActivityEvent {
  const token = input.token ?? kaito;
  const transactionHash = `0x${(100 + input.index).toString(16).padStart(64, "0")}`;
  const category = input.category ?? "token_buy_candidate";
  return {
    id: `${input.wallet.address}:${transactionHash}:${category}`,
    walletAddress: input.wallet.address,
    exchange: input.wallet.exchange,
    transactionHash,
    blockNumber: 1_000 + input.index,
    occurredAt: `2026-08-05T0${Math.min(9, input.index)}:00:00.000Z`,
    category,
    confidence: "medium",
    title: `${token.symbol} 매수 추정`,
    description: "결제자산 유출과 토큰 유입이 함께 확인됨",
    method: "swap",
    primaryAsset: { ...token, amount: "100" },
    counterAsset: null,
    evidence: ["동일 트랜잭션 결제자산 유출"],
    basescanUrl: `https://basescan.org/tx/${transactionHash}`,
    initiatedByWallet: true,
    suspectedSpam: false,
  };
}

function noiseSignal(walletSeed: WalletSeed): IntelligenceSignal {
  return {
    id: "noise:blast",
    kind: "distribution_blast",
    signalClass: "noise",
    direction: "neutral",
    severity: "critical",
    score: 100,
    confidence: "high",
    occurredAt: "2026-08-05T10:00:00.000Z",
    windowHours: 24,
    title: "스팸 대량 살포",
    summary: "수동 배포",
    wallets: [{
      address: walletSeed.address,
      exchange: walletSeed.exchange,
      rank: walletSeed.rank,
      inTop100: true,
      activityCount: 1,
    }],
    exchangeCount: 1,
    transactionHashes: [],
    basescanUrls: [],
    evidence: [],
    reasons: [],
    noiseCandidate: true,
  };
}

describe("buildWalletResearch", () => {
  it("does not treat the cohort-forming QUID deposit as an investment strategy", () => {
    const subject = wallet(1);
    const quidTransfer = transfer({
      wallet: subject,
      token: quid,
      index: 1,
      direction: "out",
      to: hotWallet,
    });
    const result = buildWalletResearch({
      wallets: [subject],
      activities: [activity({ wallet: subject, token: quid, index: 1, category: "token_send" })],
      transfers: [quidTransfer],
      transactions: [transaction({ wallet: subject, index: 1, to: quid.address, method: "transfer" })],
      signals: [noiseSignal(subject)],
      generatedAt,
    });
    const profile = result.walletProfiles[0];
    expect(profile.persona).not.toBe("exchange_feeder");
    expect(profile.meaningfulActions30d).toBe(0);
    expect(profile.behaviorMix).toEqual([]);
    expect(profile.researchPriority).toBeLessThan(20);
    expect(profile.watchpoints.join(" ")).not.toContain("스팸 대량 살포");
  });

  it("builds an evidence-rich active trader profile from repeated direct buys", () => {
    const subject = wallet(1);
    const activities = [1, 2, 3].map((index) => activity({ wallet: subject, index }));
    const transfers = [1, 2, 3].map((index) => transfer({ wallet: subject, index }));
    const transactions = [1, 2, 3].map((index) => transaction({ wallet: subject, index }));
    const result = buildWalletResearch({
      wallets: [subject],
      activities,
      transfers,
      transactions,
      signals: [],
      generatedAt,
    });
    const profile = result.walletProfiles[0];
    expect(profile.persona).toBe("active_trader");
    expect(profile.primarySector).toBe("AI·데이터");
    expect(profile.notableMoves).toHaveLength(3);
    expect(profile.trend14d).toHaveLength(14);
    expect(profile.behaviorMix[0]).toMatchObject({
      category: "token_buy_candidate",
      count30d: 3,
      count7d: 3,
      initiatedCount30d: 3,
      share: 1,
    });
    expect(profile.assetFlows[0]?.estimatedReceivedUsd).toBe(360);
    expect(result.brief.executiveSummary).toHaveLength(3);
  });

  it("labels identical passive multi-wallet receipts as passive noise", () => {
    const wallets = [wallet(1), wallet(2), wallet(3), wallet(4)];
    const distributor = "0xdddddddddddddddddddddddddddddddddddddddd";
    const transfers = wallets.map((item, index) =>
      transfer({ wallet: item, index: index + 1, from: distributor, amount: "100" }),
    );
    const result = buildWalletResearch({
      wallets,
      activities: [],
      transfers,
      transactions: [],
      signals: [],
      generatedAt,
    });
    const theme = result.themes.find((item) => item.id === `asset:${kaito.address}`);
    expect(theme?.status).toBe("passive_noise");
    expect(theme?.initiatedWalletCount7d).toBe(0);
    expect(result.walletProfiles.every((profile) => profile.interests.length === 0)).toBe(true);
    expect(
      result.walletProfiles.every(
        (profile) => profile.assetFlows[0]?.passiveDistribution === true,
      ),
    ).toBe(true);
    expect(result.metrics.activeThemes7d).toBe(0);
  });
});
