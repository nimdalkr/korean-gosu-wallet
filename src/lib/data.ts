import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardSnapshot, WalletSeedDocument } from "./domain";
import { buildIntelligence } from "./signal-engine";
import { buildDashboardSnapshot } from "./snapshot";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const dataDirectory = path.join(process.cwd(), "data");
  try {
    const stored = await readJson<DashboardSnapshot>(path.join(dataDirectory, "snapshot.json"));
    if (stored.schemaVersion === 2 && Array.isArray(stored.signals)) return stored;

    const intelligence = buildIntelligence({
      wallets: stored.wallets,
      activities: stored.activities,
      generatedAt: stored.generatedAt,
      completeHistory: false,
    });
    return {
      ...stored,
      schemaVersion: 2,
      source: {
        ...stored.source,
        refreshScope: "all",
        refreshedWalletCount: stored.wallets.length,
      },
      metrics: {
        ...stored.metrics,
        ...intelligence.metrics,
      },
      wallets: stored.wallets.map((wallet) => ({
        ...wallet,
        ...(intelligence.walletSignals.get(wallet.address.toLowerCase()) ?? {
          signalCount24h: 0,
          signalCount7d: 0,
          maxSignalScore: 0,
        }),
      })),
      signals: intelligence.signals,
      signalTrend: intelligence.signalTrend,
      assetWatchlist: intelligence.assetWatchlist,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const seed = await readJson<WalletSeedDocument>(path.join(dataDirectory, "wallets.seed.json"));
    return buildDashboardSnapshot({
      wallets: seed.wallets,
      cohort: seed.summary,
      activities: [],
      generatedAt: new Date().toISOString(),
      mode: "seed-only",
      fromBlock: null,
      toBlock: null,
      trackingWindowDays: 30,
      warnings: ["아직 최초 온체인 활동 수집을 실행하지 않았습니다."],
    });
  }
}
