import { describe, expect, it } from "vitest";
import {
  formatRawAmount,
  normalizeBlockscoutInternalTransaction,
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTransfer,
  normalizedTransferId,
} from "./blockscout";

const wallet = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const hash = `0x${"a".repeat(64)}`;

describe("Blockscout normalization", () => {
  it("formats raw token units without losing precision", () => {
    expect(formatRawAmount("1234567890123456789", 18)).toBe("1.234567890123456789");
    expect(formatRawAmount("1000000", 6)).toBe("1");
  });

  it("normalizes an inbound ERC-20 transfer", () => {
    const result = normalizeBlockscoutTransfer(
      {
        block_number: 123,
        from: { hash: other },
        to: { hash: wallet },
        log_index: 7,
        timestamp: "2026-08-04T12:00:00Z",
        transaction_hash: hash,
        token_type: "ERC-20",
        token: {
          address_hash: "0x3333333333333333333333333333333333333333",
          decimals: "6",
          name: "USD Coin",
          symbol: "USDC",
          exchange_rate: "1.001",
          holders_count: "12345",
          circulating_market_cap: "5000000",
          total_supply: "10000000",
        },
        total: { value: "2500000", decimals: "6" },
      },
      wallet,
    );
    expect(result?.direction).toBe("in");
    expect(result?.amount).toBe("2.5");
    expect(result?.token.symbol).toBe("USDC");
    expect(result?.token.exchangeRateUsd).toBe("1.001");
    expect(result?.token.holdersCount).toBe(12345);
    expect(result?.token.circulatingMarketCapUsd).toBe("5000000");
    expect(result?.id).toBe(result ? normalizedTransferId(result) : "");
  });

  it("normalizes a sent transaction", () => {
    const result = normalizeBlockscoutTransaction(
      {
        block_number: 123,
        from: { hash: wallet },
        to: { hash: other, is_contract: true },
        hash,
        timestamp: "2026-08-04T12:00:00Z",
        method: "swap",
        value: "1000000000000000000",
        status: "ok",
      },
      wallet,
    );
    expect(result?.direction).toBe("out");
    expect(result?.valueEth).toBe("1");
    expect(result?.status).toBe("ok");
    expect(result?.toIsContract).toBe(true);
  });

  it("keeps ERC-1155 batch items distinct", () => {
    const baseItem = {
      block_number: 123,
      from: { hash: other },
      to: { hash: wallet },
      log_index: 7,
      timestamp: "2026-08-04T12:00:00Z",
      transaction_hash: hash,
      token_type: "ERC-1155",
      token: {
        address_hash: "0x5555555555555555555555555555555555555555",
        name: "Batch NFT",
        symbol: "BNFT",
      },
    };
    const first = normalizeBlockscoutTransfer(
      { ...baseItem, index_in_batch: 0, total: { value: "1", token_id: "10" } },
      wallet,
    );
    const second = normalizeBlockscoutTransfer(
      { ...baseItem, index_in_batch: 1, total: { value: "1", token_id: "11" } },
      wallet,
    );
    expect(first?.id).not.toBe(second?.id);
    expect(first?.batchIndex).toBe(0);
    expect(second?.batchIndex).toBe(1);
  });

  it("normalizes a successful inbound internal ETH transfer", () => {
    const result = normalizeBlockscoutInternalTransaction(
      {
        block_number: 123,
        from: { hash: other },
        to: { hash: wallet, name: "Recipient" },
        index: 4,
        success: true,
        timestamp: "2026-08-04T12:00:00Z",
        transaction_hash: hash,
        type: "call",
        value: "250000000000000000",
      },
      wallet,
    );
    expect(result?.source).toBe("internal");
    expect(result?.direction).toBe("in");
    expect(result?.valueEth).toBe("0.25");
    expect(result?.status).toBe("ok");
  });
});
