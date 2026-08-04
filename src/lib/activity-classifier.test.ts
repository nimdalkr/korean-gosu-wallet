import { describe, expect, it } from "vitest";
import { classifyActivities } from "./activity-classifier";
import type {
  Exchange,
  NormalizedTransaction,
  NormalizedTransfer,
  TokenMetadata,
} from "./domain";

const wallet = "0x1111111111111111111111111111111111111111";
const counterparty = "0x2222222222222222222222222222222222222222";
const transactionHash = `0x${"a".repeat(64)}`;
const walletExchange = new Map<string, Exchange>([[wallet, "Upbit"]]);

const usdc: TokenMetadata = {
  address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  type: "ERC-20",
};

const alpha: TokenMetadata = {
  address: "0x4444444444444444444444444444444444444444",
  name: "Alpha",
  symbol: "ALPHA",
  decimals: 18,
  type: "ERC-20",
};

const nft: TokenMetadata = {
  address: "0x5555555555555555555555555555555555555555",
  name: "Base Pioneers",
  symbol: "BP",
  decimals: 0,
  type: "ERC-721",
};

function transfer(
  overrides: Partial<NormalizedTransfer> & Pick<NormalizedTransfer, "direction" | "token">,
): NormalizedTransfer {
  const incoming = overrides.direction === "in";
  return {
    id: `${wallet}:${transactionHash}:${overrides.logIndex ?? 1}`,
    walletAddress: wallet,
    transactionHash,
    logIndex: 1,
    blockNumber: 100,
    occurredAt: "2026-08-04T12:00:00Z",
    from: incoming ? counterparty : wallet,
    to: incoming ? wallet : counterparty,
    amount: "10",
    rawAmount: "10",
    tokenId: null,
    method: null,
    ...overrides,
  };
}

function transaction(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    id: `${wallet}:${transactionHash}`,
    walletAddress: wallet,
    transactionHash,
    blockNumber: 100,
    occurredAt: "2026-08-04T12:00:00Z",
    direction: "out",
    from: wallet,
    to: counterparty,
    method: null,
    valueEth: "0",
    status: "ok",
    ...overrides,
  };
}

describe("classifyActivities", () => {
  it("does not call a simple token receipt a buy", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [transfer({ direction: "in", token: alpha })],
      transactions: [],
    });
    expect(activities).toHaveLength(1);
    expect(activities[0].category).toBe("token_receive");
    expect(activities[0].confidence).toBe("confirmed");
  });

  it("surfaces decoded airdrops as a distinct activity", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [transfer({ direction: "in", token: alpha, method: "airdrop" })],
      transactions: [],
    });
    expect(activities[0].category).toBe("airdrop_received");
    expect(activities[0].confidence).toBe("high");
  });

  it("labels payment out plus non-payment token in as a buy candidate", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [
        transfer({ direction: "out", token: usdc, logIndex: 1 }),
        transfer({ direction: "in", token: alpha, logIndex: 2 }),
      ],
      transactions: [transaction({ method: "exactInputSingle" })],
    });
    expect(activities[0].category).toBe("token_buy_candidate");
    expect(activities[0].confidence).toBe("medium");
    expect(activities[0].primaryAsset?.symbol).toBe("ALPHA");
    expect(activities[0].counterAsset?.symbol).toBe("USDC");
  });

  it("recognizes an NFT mint from the zero address", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [
        transfer({
          direction: "in",
          token: nft,
          from: "0x0000000000000000000000000000000000000000",
          tokenId: "42",
        }),
      ],
      transactions: [],
    });
    expect(activities[0].category).toBe("nft_mint");
    expect(activities[0].confidence).toBe("confirmed");
  });

  it("recognizes an NFT purchase candidate when payment leaves", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [
        transfer({ direction: "out", token: usdc, logIndex: 1 }),
        transfer({ direction: "in", token: nft, tokenId: "8", logIndex: 2 }),
      ],
      transactions: [transaction({ method: "fulfillAdvancedOrder" })],
    });
    expect(activities[0].category).toBe("nft_purchase_candidate");
    expect(activities[0].confidence).toBe("medium");
  });

  it("uses native ETH value as payment evidence for a token buy candidate", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [transfer({ direction: "in", token: alpha })],
      transactions: [transaction({ method: "swap", valueEth: "0.15" })],
    });
    expect(activities[0].category).toBe("token_buy_candidate");
    expect(activities[0].counterAsset?.symbol).toBe("ETH");
  });

  it("prioritizes decoded bridge methods", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [transfer({ direction: "out", token: alpha })],
      transactions: [transaction({ method: "bridgeERC20To" })],
    });
    expect(activities[0].category).toBe("bridge");
  });

  it("classifies a transaction-only approval", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [],
      transactions: [transaction({ method: "approve" })],
    });
    expect(activities[0].category).toBe("approval");
    expect(activities[0].confidence).toBe("confirmed");
  });

  it("does not trust a spoofed payment symbol", () => {
    const spoofedUsdc = {
      ...usdc,
      address: "0x3333333333333333333333333333333333333333",
    };
    const activities = classifyActivities({
      walletExchange,
      transfers: [
        transfer({ direction: "out", token: spoofedUsdc, logIndex: 1 }),
        transfer({ direction: "in", token: alpha, logIndex: 2 }),
      ],
      transactions: [transaction({ method: "exactInputSingle" })],
    });
    expect(activities.map((activity) => activity.category)).toEqual([
      "token_send",
      "token_receive",
    ]);
  });

  it("drops a failed transaction-only contract call", () => {
    const activities = classifyActivities({
      walletExchange,
      transfers: [],
      transactions: [transaction({ method: "swap", status: "error" })],
    });
    expect(activities).toEqual([]);
  });

  it("preserves multiple acquired assets from one transaction", () => {
    const beta = {
      ...alpha,
      address: "0x6666666666666666666666666666666666666666",
      name: "Beta",
      symbol: "BETA",
    };
    const activities = classifyActivities({
      walletExchange,
      transfers: [
        transfer({ direction: "out", token: usdc, logIndex: 1 }),
        transfer({ direction: "in", token: alpha, logIndex: 2 }),
        transfer({ direction: "in", token: beta, logIndex: 3 }),
      ],
      transactions: [transaction({ method: "multicall" })],
    });
    expect(activities).toHaveLength(2);
    expect(activities.map((activity) => activity.primaryAsset?.symbol)).toEqual([
      "ALPHA",
      "BETA",
    ]);
    expect(new Set(activities.map((activity) => activity.id)).size).toBe(2);
  });
});
