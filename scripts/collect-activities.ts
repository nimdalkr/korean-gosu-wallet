#!/usr/bin/env tsx

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnvConfig } from "@next/env";
import {
  normalizeBlockscoutTransaction,
  normalizeBlockscoutTransfer,
  normalizeBlockscoutInternalTransaction,
  normalizedTransferId,
  type BlockscoutInternalTransaction,
  type BlockscoutPage,
  type BlockscoutTokenTransfer,
  type BlockscoutTransaction,
} from "../src/lib/blockscout";
import { classifyActivities } from "../src/lib/activity-classifier";
import type {
  NormalizedTransaction,
  NormalizedTransfer,
  TokenMetadata,
  TrackerState,
  WalletFeedCursor,
  WalletSeed,
  WalletSeedDocument,
} from "../src/lib/domain";
import { buildDashboardSnapshot } from "../src/lib/snapshot";

const ROOT = process.cwd();
loadEnvConfig(ROOT);

const SEED_PATH = path.join(ROOT, "data/wallets.seed.json");
const STATE_PATH = path.join(ROOT, "data/tracker-state.json");
const SNAPSHOT_PATH = path.join(ROOT, "data/snapshot.json");
const TRACKING_WINDOW_DAYS = positiveInteger(process.env.TRACKING_WINDOW_DAYS, 30);
const REQUEST_INTERVAL_MS = positiveInteger(process.env.REQUEST_INTERVAL_MS, 230);
const WORKERS = positiveInteger(process.env.COLLECTOR_WORKERS, 10);
const API_KEY = process.env.BLOCKSCOUT_API_KEY?.trim() || null;
const CONFIGURED_API_BASE = process.env.BLOCKSCOUT_API_BASE?.trim();
const API_BASE = (
  CONFIGURED_API_BASE ||
  (API_KEY
    ? "https://api.blockscout.com/8453/api/v2"
    : "https://base.blockscout.com/api/v2")
).replace(/\/$/, "");
const MAX_API_REQUESTS = positiveInteger(process.env.MAX_API_REQUESTS_PER_RUN, 4_500);
const mode = process.argv.includes("--bootstrap")
  ? "bootstrap"
  : process.argv.includes("--reconcile")
    ? "reconcile"
    : "incremental";
const deriveOnly = process.argv.includes("--derive-only");

interface WalletFetchResult {
  walletAddress: string;
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  warnings: string[];
  failed: boolean;
  tokenTransfersSucceeded: boolean;
  normalTransactionsRequested: boolean;
  normalTransactionsSucceeded: boolean;
  internalTransactionsRequested: boolean;
  internalTransactionsSucceeded: boolean;
  tokenCutoffTimestamp: number;
  normalTransactionCutoffTimestamp: number;
  internalTransactionCutoffTimestamp: number;
}

interface PageResult<T> {
  items: T[];
  truncated: boolean;
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readState(): Promise<TrackerState | null> {
  try {
    const stored = await readJson<TrackerState & { schemaVersion: number }>(STATE_PATH);
    const migratedCursors: Record<string, WalletFeedCursor> = {};
    if (stored.schemaVersion === 2 && stored.cursors) {
      for (const [address, cursor] of Object.entries(stored.cursors)) {
        migratedCursors[address.toLowerCase()] = {
          tokenTransfersUpdatedAt: cursor.tokenTransfersUpdatedAt ?? null,
          normalTransactionsUpdatedAt: cursor.normalTransactionsUpdatedAt ?? null,
          internalTransactionsUpdatedAt: cursor.internalTransactionsUpdatedAt ?? null,
        };
      }
    }
    return {
      ...stored,
      schemaVersion: 2,
      transfers: stored.transfers.map((transfer) => ({
        ...transfer,
        id: normalizedTransferId(transfer),
      })),
      transactions: stored.transactions.map((transaction) => ({
        ...transaction,
        source: transaction.source ?? "normal",
      })),
      cursors: migratedCursors,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function isoCutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function timestampOf(item: { timestamp?: string }) {
  return item.timestamp ? Date.parse(item.timestamp) : 0;
}

let throttleTail = Promise.resolve();
let apiRequestCount = 0;
function waitForRequestSlot() {
  const slot = throttleTail;
  throttleTail = throttleTail.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS)),
  );
  return slot;
}

async function fetchJson<T>(url: URL, attempt = 0): Promise<T> {
  if (API_KEY) url.searchParams.set("apikey", API_KEY);
  apiRequestCount += 1;
  if (apiRequestCount > MAX_API_REQUESTS) {
    throw new Error(`API request budget exceeded (${MAX_API_REQUESTS} requests).`);
  }
  await waitForRequestSlot();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "korean-gosu-wallet/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (attempt < 4) {
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt + jitter));
      return fetchJson<T>(url, attempt + 1);
    }
    throw error;
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1_000
      : 1_000 * 2 ** attempt + Math.floor(Math.random() * 250);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    return fetchJson<T>(url, attempt + 1);
  }
  if (!response.ok) {
    const message = (await response.text()).slice(0, 300);
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return (await response.json()) as T;
}

async function fetchPages<T extends { timestamp?: string }>(input: {
  pathname: string;
  initialParams?: Record<string, string>;
  cutoffTimestamp: number;
  maxPages: number;
}): Promise<PageResult<T>> {
  const items: T[] = [];
  let pageParams: Record<string, string | number | boolean> | null = null;
  let truncated = false;

  for (let pageIndex = 0; pageIndex < input.maxPages; pageIndex += 1) {
    const url = new URL(`${API_BASE}${input.pathname}`);
    for (const [key, value] of Object.entries(input.initialParams ?? {})) {
      url.searchParams.set(key, value);
    }
    for (const [key, value] of Object.entries(pageParams ?? {})) {
      url.searchParams.set(key, String(value));
    }
    const page = await fetchJson<BlockscoutPage<T>>(url);
    if (!Array.isArray(page.items)) throw new Error("Blockscout response has no items array.");
    items.push(...page.items.filter((item) => timestampOf(item) >= input.cutoffTimestamp));

    const oldest = Math.min(...page.items.map(timestampOf).filter(Boolean));
    const reachedCutoff = Number.isFinite(oldest) && oldest < input.cutoffTimestamp;
    if (
      !page.next_page_params ||
      page.items.length === 0 ||
      reachedCutoff
    ) {
      break;
    }
    if (pageIndex === input.maxPages - 1) {
      truncated = true;
      break;
    }
    pageParams = page.next_page_params;
  }
  return { items, truncated };
}

async function mapPool<T, R>(
  values: T[],
  workerCount: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, values.length) }, worker));
  return results;
}

async function fetchWallet(input: {
  wallet: WalletSeed;
  tokenCutoffTimestamp: number;
  normalTransactionCutoffTimestamp: number;
  internalTransactionCutoffTimestamp: number;
  fetchNormalTransactions: boolean;
  fetchInternalTransactions: boolean;
  maxPages: number;
}): Promise<WalletFetchResult> {
  const address = input.wallet.address.toLowerCase();
  const warnings: string[] = [];
  let transferItems: BlockscoutTokenTransfer[] = [];
  let transactionItems: BlockscoutTransaction[] = [];
  let internalTransactionItems: BlockscoutInternalTransaction[] = [];
  let tokenTransfersSucceeded = false;
  let normalTransactionsSucceeded = false;
  let internalTransactionsSucceeded = false;

  try {
    const result = await fetchPages<BlockscoutTokenTransfer>({
      pathname: `/addresses/${address}/token-transfers`,
      initialParams: { type: "ERC-20,ERC-721,ERC-1155" },
      cutoffTimestamp: input.tokenCutoffTimestamp,
      maxPages: input.maxPages,
    });
    transferItems = result.items;
    if (result.truncated) warnings.push(`token-transfers exceeded ${input.maxPages} pages`);
    tokenTransfersSucceeded = !result.truncated;
  } catch (error) {
    warnings.push(`token-transfers: ${(error as Error).message}`);
  }

  const recentTransferFound = transferItems.length > 0;
  const normalTransactionsRequested = input.fetchNormalTransactions || recentTransferFound;
  const internalTransactionsRequested = input.fetchInternalTransactions || recentTransferFound;
  if (normalTransactionsRequested) {
    try {
      const result = await fetchPages<BlockscoutTransaction>({
        pathname: `/addresses/${address}/transactions`,
        cutoffTimestamp: input.normalTransactionCutoffTimestamp,
        maxPages: input.maxPages,
      });
      transactionItems = result.items;
      if (result.truncated) warnings.push(`transactions exceeded ${input.maxPages} pages`);
      normalTransactionsSucceeded = !result.truncated;
    } catch (error) {
      warnings.push(`transactions: ${(error as Error).message}`);
    }
  }
  if (internalTransactionsRequested) {
    try {
      const result = await fetchPages<BlockscoutInternalTransaction>({
        pathname: `/addresses/${address}/internal-transactions`,
        cutoffTimestamp: input.internalTransactionCutoffTimestamp,
        maxPages: input.maxPages,
      });
      internalTransactionItems = result.items;
      if (result.truncated) warnings.push(`internal-transactions exceeded ${input.maxPages} pages`);
      internalTransactionsSucceeded = !result.truncated;
    } catch (error) {
      warnings.push(`internal-transactions: ${(error as Error).message}`);
    }
  }

  const transfers = transferItems
    .map((item) => normalizeBlockscoutTransfer(item, address))
    .filter((item): item is NormalizedTransfer => Boolean(item));
  const transactions = [
    ...transactionItems
    .map((item) => normalizeBlockscoutTransaction(item, address))
    .filter((item): item is NormalizedTransaction => Boolean(item)),
    ...internalTransactionItems
      .map((item) => normalizeBlockscoutInternalTransaction(item, address))
      .filter((item): item is NormalizedTransaction => Boolean(item)),
  ];

  return {
    walletAddress: address,
    transfers,
    transactions,
    warnings,
    failed: warnings.length > 0,
    tokenTransfersSucceeded,
    normalTransactionsRequested,
    normalTransactionsSucceeded,
    internalTransactionsRequested,
    internalTransactionsSucceeded,
    tokenCutoffTimestamp: input.tokenCutoffTimestamp,
    normalTransactionCutoffTimestamp: input.normalTransactionCutoffTimestamp,
    internalTransactionCutoffTimestamp: input.internalTransactionCutoffTimestamp,
  };
}

function mergeById<T extends { id: string; occurredAt: string }>(
  previous: T[],
  incoming: T[],
  cutoffTimestamp: number,
) {
  const merged = new Map<string, T>();
  for (const item of [...previous, ...incoming]) {
    if (Date.parse(item.occurredAt) >= cutoffTimestamp) merged.set(item.id, item);
  }
  return [...merged.values()].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}

function replaceSuccessfulWindows<
  T extends { id: string; occurredAt: string; walletAddress: string },
>(
  previous: T[],
  incoming: T[],
  replacementWindows: Map<string, number>,
  retentionCutoff: number,
) {
  const retained = previous.filter((item) => {
    const timestamp = Date.parse(item.occurredAt);
    if (timestamp < retentionCutoff) return false;
    const replacementCutoff = replacementWindows.get(item.walletAddress.toLowerCase());
    return replacementCutoff === undefined || timestamp < replacementCutoff;
  });
  return mergeById(retained, incoming, retentionCutoff);
}

async function main() {
  const startedAt = new Date();
  const seed = await readJson<WalletSeedDocument>(SEED_PATH);
  const walletFilter = new Set(
    (process.env.WALLET_FILTER ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );
  const walletsToFetch = walletFilter.size > 0
    ? seed.wallets.filter((wallet) => walletFilter.has(wallet.address.toLowerCase()))
    : seed.wallets;
  if (walletFilter.size > 0 && walletsToFetch.length !== walletFilter.size) {
    throw new Error("WALLET_FILTER contains an address that is not in the tracking seed.");
  }
  const previous = await readState();
  if (deriveOnly && !previous) {
    throw new Error("--derive-only requires data/tracker-state.json; refusing to overwrite with empty state.");
  }
  const emptyCursor = (): WalletFeedCursor => ({
    tokenTransfersUpdatedAt: null,
    normalTransactionsUpdatedAt: null,
    internalTransactionsUpdatedAt: null,
  });
  const cursorFor = (walletAddress: string) =>
    previous?.cursors[walletAddress.toLowerCase()] ?? emptyCursor();
  const baselineIncomplete = walletsToFetch.some((wallet) => {
    const cursor = cursorFor(wallet.address);
    return !cursor.tokenTransfersUpdatedAt ||
      !cursor.normalTransactionsUpdatedAt ||
      !cursor.internalTransactionsUpdatedAt;
  });
  if (deriveOnly && baselineIncomplete) {
    throw new Error("--derive-only requires a complete schema-v2 baseline for every selected wallet feed.");
  }
  const effectiveMode = !previous || baselineIncomplete ? "bootstrap" : mode;
  const retentionCutoff = Date.parse(isoCutoff(startedAt, TRACKING_WINDOW_DAYS));
  const overlapMs = 10 * 60_000;
  const reconcileLookbackDays = positiveInteger(process.env.RECONCILE_LOOKBACK_DAYS, 2);
  const reconcileCutoff = Math.max(
    retentionCutoff,
    startedAt.getTime() - reconcileLookbackDays * 86_400_000,
  );
  const cutoffFor = (
    walletAddress: string,
    feed: keyof WalletFeedCursor,
  ) => {
    if (effectiveMode === "bootstrap") return retentionCutoff;
    const cursor = cursorFor(walletAddress)[feed];
    if (effectiveMode === "reconcile") {
      return cursor
        ? Math.max(retentionCutoff, Math.min(reconcileCutoff, Date.parse(cursor) - overlapMs))
        : retentionCutoff;
    }
    return cursor
      ? Math.max(retentionCutoff, Date.parse(cursor) - overlapMs)
      : retentionCutoff;
  };
  const fetchAllTransactions = effectiveMode === "bootstrap" || effectiveMode === "reconcile";
  const maxPages = effectiveMode === "incremental"
    ? positiveInteger(process.env.INCREMENTAL_MAX_PAGES, 500)
    : positiveInteger(process.env.RECONCILE_MAX_PAGES, 500);

  const results = deriveOnly
    ? []
    : await (async () => {
        process.stdout.write(
          `Collecting ${walletsToFetch.length} wallets in ${effectiveMode} mode with per-wallet cursors.\n`,
        );
        return mapPool(walletsToFetch, WORKERS, async (wallet, index) => {
          const tokenCutoffTimestamp = cutoffFor(wallet.address, "tokenTransfersUpdatedAt");
          const normalTransactionCutoffTimestamp = cutoffFor(
            wallet.address,
            "normalTransactionsUpdatedAt",
          );
          const internalTransactionCutoffTimestamp = cutoffFor(
            wallet.address,
            "internalTransactionsUpdatedAt",
          );
          const result = await fetchWallet({
            wallet,
            tokenCutoffTimestamp,
            normalTransactionCutoffTimestamp,
            internalTransactionCutoffTimestamp,
            fetchNormalTransactions: fetchAllTransactions,
            fetchInternalTransactions: fetchAllTransactions,
            maxPages,
          });
          if ((index + 1) % 25 === 0 || index + 1 === walletsToFetch.length) {
            process.stdout.write(`Processed ${index + 1}/${walletsToFetch.length}\n`);
          }
          return result;
        });
      })();

  const incomingTransfers = results.flatMap((result) => result.transfers);
  const incomingTransactions = results.flatMap((result) => result.transactions);
  const transferReplacementWindows = new Map(
    results
      .filter((result) => result.tokenTransfersSucceeded)
      .map((result) => [result.walletAddress, result.tokenCutoffTimestamp]),
  );
  const transactionReplacementWindows = new Map(
    results
      .filter(
        (result) =>
          result.normalTransactionsRequested && result.normalTransactionsSucceeded,
      )
      .map((result) => [result.walletAddress, result.normalTransactionCutoffTimestamp]),
  );
  const internalTransactionReplacementWindows = new Map(
    results
      .filter(
        (result) =>
          result.internalTransactionsRequested && result.internalTransactionsSucceeded,
      )
      .map((result) => [result.walletAddress, result.internalTransactionCutoffTimestamp]),
  );
  const transfers = replaceSuccessfulWindows(
    previous?.transfers ?? [],
    incomingTransfers,
    transferReplacementWindows,
    retentionCutoff,
  );
  const normalTransactions = replaceSuccessfulWindows(
    (previous?.transactions ?? []).filter((item) => item.source !== "internal"),
    incomingTransactions.filter((item) => item.source !== "internal"),
    transactionReplacementWindows,
    retentionCutoff,
  );
  const internalTransactions = replaceSuccessfulWindows(
    (previous?.transactions ?? []).filter((item) => item.source === "internal"),
    incomingTransactions.filter((item) => item.source === "internal"),
    internalTransactionReplacementWindows,
    retentionCutoff,
  );
  const transactions = [...normalTransactions, ...internalTransactions].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
  const tokenMetadata: Record<string, TokenMetadata> = {
    ...(previous?.tokenMetadata ?? {}),
  };
  for (const transfer of transfers) {
    tokenMetadata[transfer.token.address.toLowerCase()] = transfer.token;
  }

  const generatedAt = deriveOnly && previous ? previous.updatedAt : new Date().toISOString();
  const cursors: Record<string, WalletFeedCursor> = { ...(previous?.cursors ?? {}) };
  for (const result of results) {
    const current = cursors[result.walletAddress] ?? emptyCursor();
    cursors[result.walletAddress] = {
      tokenTransfersUpdatedAt: result.tokenTransfersSucceeded
        ? startedAt.toISOString()
        : current.tokenTransfersUpdatedAt,
      normalTransactionsUpdatedAt:
        result.normalTransactionsRequested && result.normalTransactionsSucceeded
          ? startedAt.toISOString()
          : current.normalTransactionsUpdatedAt,
      internalTransactionsUpdatedAt:
        result.internalTransactionsRequested && result.internalTransactionsSucceeded
          ? startedAt.toISOString()
          : current.internalTransactionsUpdatedAt,
    };
  }
  const walletExchange = new Map(
    seed.wallets.map((wallet) => [wallet.address.toLowerCase(), wallet.exchange]),
  );
  const activities = classifyActivities({ walletExchange, transfers, transactions });
  const failedWallets = results
    .filter((result) => result.failed)
    .map((result) => result.walletAddress);
  const warnings = results
    .filter((result) => result.warnings.length > 0)
    .slice(0, 30)
    .map((result) => `${result.walletAddress}: ${result.warnings.join(" | ")}`);
  if (results.filter((result) => result.warnings.length > 0).length > warnings.length) {
    warnings.push("추가 수집 경고는 실행 로그를 확인하세요.");
  }
  for (const result of results.filter((item) => item.warnings.length > 0)) {
    process.stderr.write(`${result.walletAddress}: ${result.warnings.join(" | ")}\n`);
  }
  const observedBlocks = [...transfers, ...transactions].map((item) => item.blockNumber);
  const toBlock = observedBlocks.length > 0 ? Math.max(...observedBlocks) : previous?.lastProcessedBlock ?? null;
  const state: TrackerState = {
    schemaVersion: 2,
    updatedAt: generatedAt,
    lastProcessedBlock: toBlock,
    transfers,
    transactions,
    tokenMetadata,
    cursors,
  };
  const snapshot = buildDashboardSnapshot({
    wallets: seed.wallets,
    cohort: seed.summary,
    activities,
    generatedAt,
    mode: effectiveMode === "reconcile" ? "incremental" : effectiveMode,
    fromBlock: previous?.lastProcessedBlock ?? null,
    toBlock,
    trackingWindowDays: TRACKING_WINDOW_DAYS,
    warnings,
    failedWallets,
  });

  await Promise.all([
    atomicWrite(STATE_PATH, state),
    atomicWrite(SNAPSHOT_PATH, snapshot),
  ]);
  process.stdout.write(
    `Saved ${transfers.length} transfers, ${transactions.length} transactions, ${activities.length} activities. Failed wallets: ${failedWallets.length}. API requests: ${apiRequestCount}.\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
