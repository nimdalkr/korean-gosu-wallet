#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SOURCE_PATH = path.join(REPO_ROOT, "data/deposit-source.json");
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, "data/wallets.seed.json");
const FALLBACK_SOURCE_DIR = path.resolve(REPO_ROOT, "../quid_wallet_analysis");

const EXPECTED_FROZEN_SNAPSHOT = {
  cutoffBlock: 49_531_614,
  byExchange: { Upbit: 267, Bithumb: 139 },
  allSendersByExchange: { Upbit: 267, Bithumb: 141 },
  uniqueAddressCount: 406,
  allSenderUniqueAddressCount: 408,
  overlappingAddressCount: 0,
  allSenderOverlappingAddressCount: 0,
  internalKnownSenderCount: 2,
};

function usage() {
  return `Usage:
  node scripts/import-quid-seed.mjs
  node scripts/import-quid-seed.mjs --source data/deposit-source.json
  node scripts/import-quid-seed.mjs --raw /path/raw_inbound_transfers.csv --metadata /path/metadata.json --write-source data/deposit-source.json

Options:
  --source <path>        Read a checked-in normalized source JSON file.
  --raw <path>           Read the original raw inbound-transfer CSV.
  --metadata <path>      Read metadata.json; required together with --raw.
  --write-source <path>  Persist a normalized source JSON for reproducible imports.
  --output <path>        Seed output path (default: data/wallets.seed.json).
  --help                 Show this message.
`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      args.help = true;
      continue;
    }
    if (!["--source", "--raw", "--metadata", "--write-source", "--output"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    args[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = path.resolve(value);
    index += 1;
  }

  if (Boolean(args.raw) !== Boolean(args.metadata)) {
    throw new Error("--raw and --metadata must be provided together.");
  }
  if (args.source && args.raw) {
    throw new Error("Use either --source or --raw/--metadata, not both.");
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV ended inside a quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  if (rows.length < 2) throw new Error("CSV contains no data rows.");

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).filter((values) => values.some(Boolean)).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]));
  });
}

function normalizeAddress(value, label) {
  const normalized = String(value).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
}

function normalizeTransactionHash(value) {
  const normalized = String(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`Invalid transaction hash: ${value}`);
  }
  return normalized;
}

function parsePositiveInteger(value, label) {
  if (!/^\d+$/.test(String(value))) throw new Error(`Invalid ${label}: ${value}`);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${label} must be positive: ${value}`);
  return parsed;
}

function normalizeTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function formatUnits(value, decimals) {
  const digits = value.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals) || "0";
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") throw new Error("Metadata must be an object.");
  if (!metadata.known_hot_wallets || typeof metadata.known_hot_wallets !== "object") {
    throw new Error("metadata.known_hot_wallets is required.");
  }
  if (!Number.isInteger(metadata.token_decimals) || metadata.token_decimals < 0) {
    throw new Error("metadata.token_decimals must be a non-negative integer.");
  }
  if (!Number.isInteger(metadata.cutoff_block) || metadata.cutoff_block <= 0) {
    throw new Error("metadata.cutoff_block must be a positive integer.");
  }
  normalizeTimestamp(metadata.cutoff_timestamp_utc, "cutoff_timestamp_utc");

  const knownHotWallets = Object.fromEntries(
    Object.entries(metadata.known_hot_wallets).map(([exchange, addresses]) => {
      if (!Array.isArray(addresses) || addresses.length === 0) {
        throw new Error(`No known hot wallets configured for ${exchange}.`);
      }
      return [exchange, addresses.map((address) => normalizeAddress(address, `${exchange} hot wallet`))];
    }),
  );

  return { ...metadata, known_hot_wallets: knownHotWallets };
}

function normalizeEvent(event, metadata) {
  const exchange = event.exchange;
  if (!Object.hasOwn(metadata.known_hot_wallets, exchange)) {
    throw new Error(`Unknown exchange in source event: ${exchange}`);
  }
  const targetHotWallet = normalizeAddress(
    event.targetHotWallet ?? event.hot_wallet,
    "target hot wallet",
  );
  if (!metadata.known_hot_wallets[exchange].includes(targetHotWallet)) {
    throw new Error(`${targetHotWallet} is not a configured ${exchange} hot wallet.`);
  }

  const logIndexValue = event.logIndex ?? event.log_index;
  if (!/^\d+$/.test(String(logIndexValue))) throw new Error(`Invalid log index: ${logIndexValue}`);

  return {
    exchange,
    targetHotWallet,
    fromAddress: normalizeAddress(event.fromAddress ?? event.from_address, "sender address"),
    amountRaw: parsePositiveInteger(event.amountRaw ?? event.amount_raw, "raw QUID amount").toString(),
    timestampUtc: normalizeTimestamp(event.timestampUtc ?? event.timestamp_utc, "event timestamp"),
    txHash: normalizeTransactionHash(event.txHash ?? event.tx_hash),
    logIndex: Number(logIndexValue),
  };
}

async function loadRawSource(rawPath, metadataPath) {
  const [rawCsv, metadataJson] = await Promise.all([
    readFile(rawPath, "utf8"),
    readFile(metadataPath, "utf8"),
  ]);
  const metadata = normalizeMetadata(JSON.parse(metadataJson));
  const rawRows = parseCsv(rawCsv);
  const requiredColumns = [
    "exchange",
    "hot_wallet",
    "timestamp_utc",
    "tx_hash",
    "log_index",
    "from_address",
    "amount_raw",
  ];
  for (const column of requiredColumns) {
    if (!Object.hasOwn(rawRows[0], column)) throw new Error(`CSV is missing required column: ${column}`);
  }
  return { metadata, events: rawRows.map((row) => normalizeEvent(row, metadata)) };
}

async function loadNormalizedSource(sourcePath) {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  if (source.schemaVersion !== 1 || !Array.isArray(source.events)) {
    throw new Error("Normalized source must have schemaVersion 1 and an events array.");
  }
  const metadata = normalizeMetadata(source.metadata);
  return { metadata, events: source.events.map((event) => normalizeEvent(event, metadata)) };
}

function validateSource(metadata, events) {
  if (events.length === 0) throw new Error("Source has no events.");
  if (metadata.unique_event_count != null && events.length !== metadata.unique_event_count) {
    throw new Error(`Source has ${events.length} events; metadata expects ${metadata.unique_event_count}.`);
  }

  const eventKeys = new Set();
  const allAmountByExchange = new Map();
  const allTransferCountByExchange = new Map();
  for (const event of events) {
    const eventKey = `${event.txHash}:${event.logIndex}`;
    if (eventKeys.has(eventKey)) throw new Error(`Duplicate source event: ${eventKey}`);
    eventKeys.add(eventKey);
    allAmountByExchange.set(
      event.exchange,
      (allAmountByExchange.get(event.exchange) ?? 0n) + BigInt(event.amountRaw),
    );
    allTransferCountByExchange.set(
      event.exchange,
      (allTransferCountByExchange.get(event.exchange) ?? 0) + 1,
    );
  }

  for (const [exchange, expected] of Object.entries(metadata.per_exchange ?? {})) {
    if (expected.transfer_count != null && allTransferCountByExchange.get(exchange) !== expected.transfer_count) {
      throw new Error(`${exchange} transfer count differs from metadata.`);
    }
    if (expected.amount_raw != null && allAmountByExchange.get(exchange) !== BigInt(expected.amount_raw)) {
      throw new Error(`${exchange} raw QUID total differs from metadata.`);
    }
  }
}

function buildSeed(metadata, events) {
  const exchanges = Object.keys(metadata.known_hot_wallets);
  const allKnownHotWallets = new Set(Object.values(metadata.known_hot_wallets).flat());
  const externalEvents = events.filter((event) => !allKnownHotWallets.has(event.fromAddress));
  const allSenderAddressSets = new Map(
    exchanges.map((exchange) => [
      exchange,
      new Set(events.filter((event) => event.exchange === exchange).map((event) => event.fromAddress)),
    ]),
  );
  const allSenderAddresses = new Set(events.map((event) => event.fromAddress));
  const allSenderExchangeCount = new Map();
  for (const addresses of allSenderAddressSets.values()) {
    for (const address of addresses) {
      allSenderExchangeCount.set(address, (allSenderExchangeCount.get(address) ?? 0) + 1);
    }
  }
  const allSenderOverlappingAddresses = [...allSenderExchangeCount]
    .filter(([, exchangeCount]) => exchangeCount > 1)
    .map(([address]) => address)
    .sort();
  const internalKnownSenderAddresses = [...allSenderAddresses]
    .filter((address) => allKnownHotWallets.has(address))
    .sort();
  const grouped = new Map();

  for (const event of externalEvents) {
    const key = `${event.exchange}:${event.fromAddress}`;
    let wallet = grouped.get(key);
    if (!wallet) {
      wallet = {
        address: event.fromAddress,
        exchange: event.exchange,
        amountRaw: 0n,
        depositTransferCount: 0,
        firstDepositAt: event.timestampUtc,
        lastDepositAt: event.timestampUtc,
        targetHotWallets: new Set(),
      };
      grouped.set(key, wallet);
    }
    wallet.amountRaw += BigInt(event.amountRaw);
    wallet.depositTransferCount += 1;
    if (event.timestampUtc < wallet.firstDepositAt) wallet.firstDepositAt = event.timestampUtc;
    if (event.timestampUtc > wallet.lastDepositAt) wallet.lastDepositAt = event.timestampUtc;
    wallet.targetHotWallets.add(event.targetHotWallet);
  }

  const wallets = [];
  const summaryByExchange = {};
  const addressSets = new Map();
  for (const exchange of exchanges) {
    const ranked = [...grouped.values()]
      .filter((wallet) => wallet.exchange === exchange)
      .sort((left, right) => {
        if (left.amountRaw !== right.amountRaw) return left.amountRaw > right.amountRaw ? -1 : 1;
        return left.address.localeCompare(right.address);
      });
    const exchangeEvents = externalEvents.filter((event) => event.exchange === exchange);
    const exchangeAmountRaw = exchangeEvents.reduce((total, event) => total + BigInt(event.amountRaw), 0n);
    addressSets.set(exchange, new Set(ranked.map((wallet) => wallet.address)));
    summaryByExchange[exchange] = {
      walletCount: ranked.length,
      top100Count: Math.min(100, ranked.length),
      depositTransferCount: exchangeEvents.length,
      depositAmountQuid: formatUnits(exchangeAmountRaw, metadata.token_decimals),
    };

    ranked.forEach((wallet, index) => {
      const rank = index + 1;
      wallets.push({
        address: wallet.address,
        exchange,
        rank,
        depositAmountQuid: formatUnits(wallet.amountRaw, metadata.token_decimals),
        depositTransferCount: wallet.depositTransferCount,
        firstDepositAt: wallet.firstDepositAt,
        lastDepositAt: wallet.lastDepositAt,
        targetHotWallets: [...wallet.targetHotWallets].sort(),
        inTop100: rank <= 100,
      });
    });
  }

  const uniqueAddresses = new Set(wallets.map((wallet) => wallet.address));
  const addressExchangeCount = new Map();
  for (const wallet of wallets) {
    addressExchangeCount.set(wallet.address, (addressExchangeCount.get(wallet.address) ?? 0) + 1);
  }
  const overlappingAddresses = [...addressExchangeCount]
    .filter(([, exchangeCount]) => exchangeCount > 1)
    .map(([address]) => address)
    .sort();

  const seed = {
    schemaVersion: 1,
    source: {
      kind: "frozen-onchain-snapshot",
      chain: metadata.chain,
      chainId: metadata.chain_id,
      token: {
        contract: normalizeAddress(metadata.token_contract, "token contract"),
        name: metadata.token_name,
        symbol: metadata.token_symbol,
        decimals: metadata.token_decimals,
      },
      cutoffBlock: metadata.cutoff_block,
      cutoffTimestampUtc: metadata.cutoff_timestamp_utc,
      cutoffTimestampKst: metadata.cutoff_timestamp_kst,
      generatedAtUtc: metadata.generated_at_utc,
      populationDefinition: metadata.population_definition,
      rankingDefinition:
        "Known Upbit and Bithumb hot-wallet senders are excluded first. Remaining sender addresses are aggregated per exchange by raw QUID amount, ranked by amount descending, and ties are ordered by lowercase address.",
      externalSenderDefinition:
        "A sender is external when its lowercase address is not one of the five supplied exchange hot wallets.",
      knownHotWallets: metadata.known_hot_wallets,
      provenance: {
        primarySource: metadata.primary_source,
        validationSource: metadata.validation_source,
        rpcEventFingerprintsMatch: metadata.rpc_event_fingerprints_match,
        sourceEventCount: events.length,
      },
    },
    summary: {
      walletRows: wallets.length,
      uniqueAddressCount: uniqueAddresses.size,
      overlappingAddressCount: overlappingAddresses.length,
      overlappingAddresses,
      allSenders: {
        uniqueAddressCount: allSenderAddresses.size,
        overlappingAddressCount: allSenderOverlappingAddresses.length,
        overlappingAddresses: allSenderOverlappingAddresses,
        internalKnownSenderCount: internalKnownSenderAddresses.length,
        internalKnownSenderAddresses,
        byExchange: Object.fromEntries(
          exchanges.map((exchange) => [
            exchange,
            { walletCount: allSenderAddressSets.get(exchange)?.size ?? 0 },
          ]),
        ),
      },
      byExchange: summaryByExchange,
    },
    wallets,
  };

  validateFrozenSnapshot(seed, addressSets);
  return seed;
}

function validateFrozenSnapshot(seed, addressSets) {
  if (seed.source.cutoffBlock !== EXPECTED_FROZEN_SNAPSHOT.cutoffBlock) return;
  for (const [exchange, expectedCount] of Object.entries(EXPECTED_FROZEN_SNAPSHOT.byExchange)) {
    const actualCount = seed.summary.byExchange[exchange]?.walletCount;
    if (actualCount !== expectedCount) {
      throw new Error(`${exchange} external wallet count is ${actualCount}; expected ${expectedCount}.`);
    }
  }
  if (seed.summary.uniqueAddressCount !== EXPECTED_FROZEN_SNAPSHOT.uniqueAddressCount) {
    throw new Error(
      `External address union is ${seed.summary.uniqueAddressCount}; expected ${EXPECTED_FROZEN_SNAPSHOT.uniqueAddressCount}.`,
    );
  }
  if (seed.summary.overlappingAddressCount !== EXPECTED_FROZEN_SNAPSHOT.overlappingAddressCount) {
    throw new Error(
      `Exchange overlap is ${seed.summary.overlappingAddressCount}; expected ${EXPECTED_FROZEN_SNAPSHOT.overlappingAddressCount}.`,
    );
  }
  if (seed.summary.allSenders.uniqueAddressCount !== EXPECTED_FROZEN_SNAPSHOT.allSenderUniqueAddressCount) {
    throw new Error("All-sender union differs from the frozen snapshot.");
  }
  if (
    seed.summary.allSenders.overlappingAddressCount !==
    EXPECTED_FROZEN_SNAPSHOT.allSenderOverlappingAddressCount
  ) {
    throw new Error("All-sender exchange overlap differs from the frozen snapshot.");
  }
  if (seed.summary.allSenders.internalKnownSenderCount !== EXPECTED_FROZEN_SNAPSHOT.internalKnownSenderCount) {
    throw new Error("Known internal sender count differs from the frozen snapshot.");
  }
  for (const [exchange, expectedCount] of Object.entries(EXPECTED_FROZEN_SNAPSHOT.allSendersByExchange)) {
    if (seed.summary.allSenders.byExchange[exchange]?.walletCount !== expectedCount) {
      throw new Error(`${exchange} all-sender count differs from the frozen snapshot.`);
    }
  }

  const [firstExchange, ...otherExchanges] = [...addressSets.keys()];
  const firstAddresses = addressSets.get(firstExchange) ?? new Set();
  const calculatedOverlap = [...firstAddresses].filter((address) =>
    otherExchanges.some((exchange) => addressSets.get(exchange)?.has(address)),
  );
  if (calculatedOverlap.length !== seed.summary.overlappingAddressCount) {
    throw new Error("Overlap summary failed independent set validation.");
  }
}

function normalizedSourceDocument(metadata, events) {
  return {
    schemaVersion: 1,
    description:
      "Normalized event-level inputs used to reproduce data/wallets.seed.json without a private filesystem dependency.",
    metadata,
    events,
  };
}

async function writeJson(outputPath, value) {
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  let source;
  if (args.raw) {
    source = await loadRawSource(args.raw, args.metadata);
  } else {
    const sourcePath = args.source ?? DEFAULT_SOURCE_PATH;
    if (existsSync(sourcePath)) {
      source = await loadNormalizedSource(sourcePath);
    } else {
      const fallbackRawPath = path.join(FALLBACK_SOURCE_DIR, "raw_inbound_transfers.csv");
      const fallbackMetadataPath = path.join(FALLBACK_SOURCE_DIR, "metadata.json");
      if (!existsSync(fallbackRawPath) || !existsSync(fallbackMetadataPath)) {
        throw new Error(
          `No normalized source at ${sourcePath} and no fallback source at ${FALLBACK_SOURCE_DIR}.`,
        );
      }
      source = await loadRawSource(fallbackRawPath, fallbackMetadataPath);
    }
  }

  validateSource(source.metadata, source.events);
  if (args.writeSource) {
    await writeJson(args.writeSource, normalizedSourceDocument(source.metadata, source.events));
  }
  const seed = buildSeed(source.metadata, source.events);
  const outputPath = args.output ?? DEFAULT_OUTPUT_PATH;
  await writeJson(outputPath, seed);

  const counts = Object.entries(seed.summary.byExchange)
    .map(([exchange, summary]) => `${exchange}=${summary.walletCount}`)
    .join(", ");
  process.stdout.write(
    `Wrote ${outputPath}\n${counts}; union=${seed.summary.uniqueAddressCount}; overlap=${seed.summary.overlappingAddressCount}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
