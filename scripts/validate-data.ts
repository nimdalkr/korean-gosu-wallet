#!/usr/bin/env tsx

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type {
  DashboardSnapshot,
  TrackerState,
  WalletSeedDocument,
} from "../src/lib/domain";
import { normalizedTransferId } from "../src/lib/blockscout";

const ROOT = process.cwd();

type StoredDashboardSnapshot = Omit<DashboardSnapshot, "schemaVersion"> & {
  schemaVersion: number;
  signals?: DashboardSnapshot["signals"];
  signalTrend?: DashboardSnapshot["signalTrend"];
  assetWatchlist?: DashboardSnapshot["assetWatchlist"];
  research?: DashboardSnapshot["research"];
};

type StoredTrackerState = Omit<TrackerState, "schemaVersion" | "deliveredSignalIds"> & {
  schemaVersion: number;
  deliveredSignalIds?: Record<string, string>;
};

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")) as T;
}

async function readOptionalJson<T>(relativePath: string): Promise<T | null> {
  try {
    return await readJson<T>(relativePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function unique<T>(values: T[]) {
  return new Set(values).size === values.length;
}

async function readSimpleCsv(relativePath: string) {
  const lines = (await readFile(path.join(ROOT, relativePath), "utf8"))
    .trim()
    .split("\n");
  const columns = lines[0].split(",");
  return lines.slice(1).map((line) =>
    Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])),
  );
}

async function main() {
  const [seed, snapshot, state, allSenderCsv, externalCsv, hotWalletTop100Csv, upbitTop100Csv, bithumbTop100Csv] = await Promise.all([
    readJson<WalletSeedDocument>("data/wallets.seed.json"),
    readJson<StoredDashboardSnapshot>("data/snapshot.json"),
    readOptionalJson<StoredTrackerState>("data/tracker-state.json"),
    readSimpleCsv("data/deposit-senders-all.csv"),
    readSimpleCsv("data/wallets-external.csv"),
    readSimpleCsv("data/hotwallet-top100.csv"),
    readSimpleCsv("data/upbit-top100.csv"),
    readSimpleCsv("data/bithumb-top100.csv"),
  ]);
  const addresses = seed.wallets.map((wallet) => wallet.address.toLowerCase());
  assert(seed.wallets.length === 406, `Expected 406 seed rows, got ${seed.wallets.length}.`);
  assert(unique(addresses), "Seed wallet addresses are not unique.");
  assert(seed.summary.uniqueAddressCount === 406, "Seed summary unique count changed.");
  assert(seed.summary.overlappingAddressCount === 0, "Unexpected cross-exchange overlap.");
  assert(seed.summary.allSenders.uniqueAddressCount === 408, "Raw sender count changed.");
  assert(seed.summary.allSenders.overlappingAddressCount === 0, "Unexpected raw sender overlap.");
  assert(seed.summary.allSenders.internalKnownSenderCount === 2, "Internal sender count changed.");
  assert(seed.wallets.filter((wallet) => wallet.exchange === "Upbit").length === 267, "Upbit external count changed.");
  assert(seed.wallets.filter((wallet) => wallet.exchange === "Bithumb").length === 139, "Bithumb external count changed.");
  assert(seed.wallets.filter((wallet) => wallet.inTop100).length === 200, "Top-100 flags must total 200.");
  assert(addresses.every((address) => /^0x[0-9a-f]{40}$/.test(address)), "Invalid seed address.");
  assert(allSenderCsv.length === 408, "Raw sender CSV row count changed.");
  assert(externalCsv.length === 406, "External wallet CSV row count changed.");
  assert(hotWalletTop100Csv.length === 448, "Per-hot-wallet Top-100 CSV row count changed.");
  assert(upbitTop100Csv.length === 100, "Upbit Top-100 CSV row count changed.");
  assert(bithumbTop100Csv.length === 100, "Bithumb Top-100 CSV row count changed.");
  assert(
    externalCsv.every((row, index) => row.address === addresses[index]),
    "External wallet CSV does not match seed order.",
  );
  assert(
    allSenderCsv.filter((row) => row.isKnownExchangeHotWallet === "true").length === 2,
    "Raw sender CSV internal-wallet markers changed.",
  );
  for (const targetHotWallet of seed.wallets.flatMap((wallet) => wallet.targetHotWallets)) {
    const rows = hotWalletTop100Csv.filter((row) => row.targetHotWallet === targetHotWallet);
    assert(rows.length > 0 && rows.length <= 100, `Invalid hot-wallet ranking for ${targetHotWallet}.`);
    assert(
      rows.every((row, index) => Number(row.rank) === index + 1),
      `Non-continuous hot-wallet ranking for ${targetHotWallet}.`,
    );
  }

  for (const exchange of ["Upbit", "Bithumb"] as const) {
    const ranks = seed.wallets
      .filter((wallet) => wallet.exchange === exchange)
      .map((wallet) => wallet.rank)
      .sort((a, b) => a - b);
    assert(ranks.every((rank, index) => rank === index + 1), `${exchange} ranks are not continuous.`);
  }

  assert(
    snapshot.schemaVersion === 1 || snapshot.schemaVersion === 2 || snapshot.schemaVersion === 3,
    "Unsupported snapshot schema.",
  );
  assert(snapshot.wallets.length === 406, "Snapshot does not contain all tracked wallets.");
  assert(snapshot.coverage.trackedWallets === 406, "Snapshot tracked count changed.");
  assert(snapshot.coverage.depositSenderWallets === 408, "Raw deposit sender count changed.");
  assert(snapshot.coverage.bithumbDepositSenders === 141, "Bithumb raw sender count changed.");
  assert(unique(snapshot.wallets.map((wallet) => wallet.address)), "Snapshot wallet duplication.");
  assert(unique(snapshot.activities.map((activity) => activity.id)), "Activity IDs are not unique.");
  assert(snapshot.activities.every((activity) => addresses.includes(activity.walletAddress)), "Activity references an unknown wallet.");
  assert(Number.isFinite(Date.parse(snapshot.generatedAt)), "Invalid snapshot timestamp.");
  assert(snapshot.activities.length <= 750, "Published activity payload exceeds 750 rows.");
  assert(
    snapshot.metrics.activityRowsIncluded === snapshot.activities.length,
    "Published activity row metric does not match the payload.",
  );
  assert(
    snapshot.source.degraded === Boolean(
      snapshot.source.failedWallets.length || snapshot.source.warnings.length,
    ),
    "Snapshot degraded flag is inconsistent with collection warnings.",
  );
  if (snapshot.schemaVersion === 2 || snapshot.schemaVersion === 3) {
    assert(Array.isArray(snapshot.signals), "Signal payload is missing.");
    assert(Array.isArray(snapshot.signalTrend), "Signal trend payload is missing.");
    assert(Array.isArray(snapshot.assetWatchlist), "Asset watchlist payload is missing.");
    assert(unique(snapshot.signals.map((signal) => signal.id)), "Signal IDs are not unique.");
    assert(
      snapshot.signals.every(
        (signal) =>
          Number.isInteger(signal.score) &&
          signal.score >= 0 &&
          signal.score <= 100 &&
          signal.wallets.every((wallet) => addresses.includes(wallet.address)),
      ),
      "Signal score or wallet evidence is invalid.",
    );
    assert(snapshot.signalTrend.length === 30, "Signal trend must contain 30 KST days.");
    assert(
      snapshot.source.refreshScope === "all" || snapshot.source.refreshScope === "top100",
      "Snapshot refresh scope is invalid.",
    );
    assert(
      Number.isInteger(snapshot.source.refreshedWalletCount) &&
        snapshot.source.refreshedWalletCount >= 0 &&
        snapshot.source.refreshedWalletCount <= 406,
      "Snapshot refreshed wallet count is invalid.",
    );
  }
  if (snapshot.schemaVersion === 3) {
    assert(snapshot.research, "Wallet research payload is missing.");
    assert(
      snapshot.research.walletProfiles.length === 406,
      "Wallet research must contain all tracked wallets.",
    );
    assert(
      unique(snapshot.research.walletProfiles.map((profile) => profile.address)),
      "Wallet research profiles are duplicated.",
    );
    assert(
      snapshot.research.walletProfiles.every(
        (profile) =>
          addresses.includes(profile.address) &&
          Number.isInteger(profile.researchPriority) &&
          profile.researchPriority >= 0 &&
          profile.researchPriority <= 100 &&
          profile.agencyScore >= 0 &&
          profile.agencyScore <= 100 &&
          profile.trend14d.length === 14 &&
          Array.isArray(profile.behaviorMix) &&
          profile.assetFlows.every(
            (asset) => typeof asset.passiveDistribution === "boolean",
          ),
      ),
      "Wallet research score, address, trend, or behavior mix is invalid.",
    );
    assert(
      unique(snapshot.research.themes.map((theme) => theme.id)),
      "Research themes are duplicated.",
    );
    assert(
      snapshot.research.themes.every(
        (theme) =>
          Number.isInteger(theme.score) &&
          theme.score >= 0 &&
          theme.score <= 100 &&
          theme.topWallets.every((address) => addresses.includes(address)),
      ),
      "Research theme score or wallet evidence is invalid.",
    );
  }
  if (process.env.REQUIRE_TRACKER_STATE === "true") {
    assert(state, "REQUIRE_TRACKER_STATE=true but data/tracker-state.json is missing.");
  }
  if (state) {
    assert(
      state.schemaVersion === 2 || state.schemaVersion === 3,
      "Unsupported tracker-state schema.",
    );
    if (process.env.REQUIRE_TRACKER_STATE === "true") {
      assert(state.updatedAt === snapshot.generatedAt, "State and snapshot generations differ.");
      assert(
        (state.schemaVersion === 2 && snapshot.schemaVersion === 1) ||
          (state.schemaVersion === 3 && snapshot.schemaVersion === 2) ||
          (state.schemaVersion === 3 && snapshot.schemaVersion === 3),
        "State and snapshot schema generations are incompatible.",
      );
    }
    assert(unique(state.transfers.map((item) => item.id)), "Transfer IDs are not unique.");
    assert(unique(state.transactions.map((item) => item.id)), "Transaction IDs are not unique.");
    assert(
      state.transfers.every((item) => item.id === normalizedTransferId(item)),
      "Tracker contains a legacy or malformed transfer ID.",
    );
    assert(
      state.transactions.every(
        (item) => item.source === "normal" || item.source === "internal",
      ),
      "Tracker transaction source is missing.",
    );
    const stateAddresses = new Set(addresses);
    assert(
      state.transfers.every((item) => stateAddresses.has(item.walletAddress)),
      "Tracker transfer references an unknown wallet.",
    );
    assert(
      state.transactions.every((item) => stateAddresses.has(item.walletAddress)),
      "Tracker transaction references an unknown wallet.",
    );
    assert(
      Object.keys(state.cursors).every((address) => stateAddresses.has(address)),
      "Tracker contains a cursor for an unknown wallet.",
    );
    if (state.schemaVersion === 3) {
      assert(state.deliveredSignalIds, "Tracker signal-delivery ledger is missing.");
      assert(
        Object.values(state.deliveredSignalIds).every((value) =>
          Number.isFinite(Date.parse(value)),
        ),
        "Tracker signal-delivery ledger contains an invalid timestamp.",
      );
    }
    const failedAddresses = new Set(snapshot.source.failedWallets);
    for (const address of addresses) {
      const cursor = state.cursors[address];
      const values = cursor
        ? [
            cursor.tokenTransfersUpdatedAt,
            cursor.normalTransactionsUpdatedAt,
            cursor.internalTransactionsUpdatedAt,
          ]
        : [null, null, null];
      assert(
        values.every((value) => value === null || Number.isFinite(Date.parse(value))),
        `Invalid feed cursor for ${address}.`,
      );
      if (!values.every(Boolean) && state.updatedAt === snapshot.generatedAt) {
        assert(
          snapshot.source.degraded && failedAddresses.has(address),
          `Incomplete baseline for ${address} is not surfaced as degraded.`,
        );
      }
    }
  }
  const maximumFailedWallets = Number(process.env.MAX_FAILED_WALLETS ?? "0");
  assert(
    snapshot.source.failedWallets.length <= maximumFailedWallets,
    `Collector failed for ${snapshot.source.failedWallets.length} wallets (allowed: ${maximumFailedWallets}).`,
  );
  const maximumWarnings = Number(process.env.MAX_COLLECTION_WARNINGS ?? "0");
  assert(
    snapshot.source.warnings.length <= maximumWarnings,
    `Collector emitted ${snapshot.source.warnings.length} warnings (allowed: ${maximumWarnings}).`,
  );

  try {
    await access(path.join(ROOT, "public/snapshot.json"));
    throw new Error("Sensitive snapshot must not exist under public/.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  process.stdout.write(
    state
      ? `Validated 406 wallets, ${state.transfers.length} transfers, ${state.transactions.length} transactions, ${snapshot.activities.length} activity rows, ${snapshot.signals?.length ?? 0} intelligence signals, and ${snapshot.research?.walletProfiles.length ?? 0} wallet research profiles.\n`
      : `Validated 406 wallets and ${snapshot.activities.length} published activity rows (tracker checkpoint not present).\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
