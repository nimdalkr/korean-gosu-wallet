import { describe, expect, it } from "vitest";
import type { WalletSeed } from "./domain";
import { summarizeResearchDesk } from "./research-summary";
import { buildWalletResearch } from "./wallet-research";

const wallet: WalletSeed = {
  address: "0x1111111111111111111111111111111111111111",
  exchange: "Upbit",
  rank: 1,
  depositAmountQuid: "100",
  depositTransferCount: 1,
  firstDepositAt: "2026-08-01T00:00:00.000Z",
  lastDepositAt: "2026-08-01T00:00:00.000Z",
  targetHotWallets: ["0x2222222222222222222222222222222222222222"],
  inTop100: true,
};

describe("research dashboard summary", () => {
  it("keeps ranking fields but omits on-demand dossier collections", () => {
    const full = buildWalletResearch({
      wallets: [wallet],
      activities: [],
      transfers: [],
      transactions: [],
      signals: [],
      generatedAt: "2026-08-06T00:00:00.000Z",
    });
    const summary = summarizeResearchDesk(full);
    const profile = summary.walletProfiles[0];

    expect(profile.address).toBe(wallet.address);
    expect(profile.researchPriority).toBeTypeOf("number");
    expect(profile).not.toHaveProperty("assetFlows");
    expect(profile).not.toHaveProperty("counterparties");
    expect(profile).not.toHaveProperty("notableMoves");
    expect(profile).not.toHaveProperty("trend14d");
  });
});
