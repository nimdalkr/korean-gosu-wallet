import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardSnapshot, WalletSeedDocument } from "./domain";
import { buildDashboardSnapshot } from "./snapshot";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const dataDirectory = path.join(process.cwd(), "data");
  try {
    return await readJson<DashboardSnapshot>(path.join(dataDirectory, "snapshot.json"));
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
