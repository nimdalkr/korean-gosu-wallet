#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dataDirectory = path.join(root, "data");

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(dataDirectory, filename), "utf8"));
}

function formatUnits(rawValue, decimals = 18) {
  const digits = BigInt(rawValue).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals) || "0";
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(columns, rows) {
  return `${[
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n")}\n`;
}

const [source, seed] = await Promise.all([
  readJson("deposit-source.json"),
  readJson("wallets.seed.json"),
]);
const knownHotWallets = new Set(
  Object.values(source.metadata.known_hot_wallets).flat().map((address) => address.toLowerCase()),
);
const allSenderRows = [];
const hotWalletTop100Rows = [];
for (const exchange of ["Upbit", "Bithumb"]) {
  const aggregates = new Map();
  for (const event of source.events.filter((item) => item.exchange === exchange)) {
    const address = event.fromAddress.toLowerCase();
    const current = aggregates.get(address) ?? {
      address,
      amountRaw: 0n,
      transferCount: 0,
      firstDepositAt: event.timestampUtc,
      lastDepositAt: event.timestampUtc,
      targetHotWallets: new Set(),
    };
    current.amountRaw += BigInt(event.amountRaw);
    current.transferCount += 1;
    if (event.timestampUtc < current.firstDepositAt) current.firstDepositAt = event.timestampUtc;
    if (event.timestampUtc > current.lastDepositAt) current.lastDepositAt = event.timestampUtc;
    current.targetHotWallets.add(event.targetHotWallet.toLowerCase());
    aggregates.set(address, current);
  }
  const ranked = [...aggregates.values()].sort(
    (a, b) =>
      a.amountRaw === b.amountRaw
        ? a.address.localeCompare(b.address)
        : a.amountRaw > b.amountRaw
          ? -1
          : 1,
  );
  ranked.forEach((item, index) => {
    allSenderRows.push({
      exchange,
      rank: index + 1,
      address: item.address,
      isKnownExchangeHotWallet: knownHotWallets.has(item.address),
      depositAmountQuid: formatUnits(item.amountRaw),
      depositTransferCount: item.transferCount,
      firstDepositAt: item.firstDepositAt,
      lastDepositAt: item.lastDepositAt,
      targetHotWallets: [...item.targetHotWallets].sort().join(";"),
    });
  });

  const targetHotWallets = [
    ...new Set(
      source.events
        .filter((item) => item.exchange === exchange)
        .map((item) => item.targetHotWallet.toLowerCase()),
    ),
  ].sort();
  for (const targetHotWallet of targetHotWallets) {
    const targetAggregates = new Map();
    for (const event of source.events.filter(
      (item) =>
        item.exchange === exchange &&
        item.targetHotWallet.toLowerCase() === targetHotWallet,
    )) {
      const address = event.fromAddress.toLowerCase();
      const current = targetAggregates.get(address) ?? {
        address,
        amountRaw: 0n,
        transferCount: 0,
        firstDepositAt: event.timestampUtc,
        lastDepositAt: event.timestampUtc,
      };
      current.amountRaw += BigInt(event.amountRaw);
      current.transferCount += 1;
      if (event.timestampUtc < current.firstDepositAt) current.firstDepositAt = event.timestampUtc;
      if (event.timestampUtc > current.lastDepositAt) current.lastDepositAt = event.timestampUtc;
      targetAggregates.set(address, current);
    }
    const rankedForTarget = [...targetAggregates.values()]
      .sort(
        (a, b) =>
          a.amountRaw === b.amountRaw
            ? a.address.localeCompare(b.address)
            : a.amountRaw > b.amountRaw
              ? -1
              : 1,
      )
      .slice(0, 100);
    rankedForTarget.forEach((item, index) => {
      hotWalletTop100Rows.push({
        exchange,
        targetHotWallet,
        rank: index + 1,
        address: item.address,
        isKnownExchangeHotWallet: knownHotWallets.has(item.address),
        depositAmountQuid: formatUnits(item.amountRaw),
        depositTransferCount: item.transferCount,
        firstDepositAt: item.firstDepositAt,
        lastDepositAt: item.lastDepositAt,
      });
    });
  }
}

const externalRows = seed.wallets.map((wallet) => ({
  exchange: wallet.exchange,
  rank: wallet.rank,
  address: wallet.address,
  depositAmountQuid: wallet.depositAmountQuid,
  depositTransferCount: wallet.depositTransferCount,
  firstDepositAt: wallet.firstDepositAt,
  lastDepositAt: wallet.lastDepositAt,
  targetHotWallets: wallet.targetHotWallets.join(";"),
  inTop100: wallet.inTop100,
}));
const allColumns = [
  "exchange",
  "rank",
  "address",
  "isKnownExchangeHotWallet",
  "depositAmountQuid",
  "depositTransferCount",
  "firstDepositAt",
  "lastDepositAt",
  "targetHotWallets",
];
const externalColumns = [
  "exchange",
  "rank",
  "address",
  "depositAmountQuid",
  "depositTransferCount",
  "firstDepositAt",
  "lastDepositAt",
  "targetHotWallets",
  "inTop100",
];
const hotWalletColumns = [
  "exchange",
  "targetHotWallet",
  "rank",
  "address",
  "isKnownExchangeHotWallet",
  "depositAmountQuid",
  "depositTransferCount",
  "firstDepositAt",
  "lastDepositAt",
];

await Promise.all([
  writeFile(path.join(dataDirectory, "deposit-senders-all.csv"), toCsv(allColumns, allSenderRows)),
  writeFile(path.join(dataDirectory, "wallets-external.csv"), toCsv(externalColumns, externalRows)),
  writeFile(
    path.join(dataDirectory, "hotwallet-top100.csv"),
    toCsv(hotWalletColumns, hotWalletTop100Rows),
  ),
  ...["Upbit", "Bithumb"].map((exchange) =>
    writeFile(
      path.join(dataDirectory, `${exchange.toLowerCase()}-top100.csv`),
      toCsv(
        externalColumns,
        externalRows.filter((row) => row.exchange === exchange && row.inTop100),
      ),
    ),
  ),
]);

process.stdout.write(
  `Exported ${allSenderRows.length} raw sender rows, ${externalRows.length} external rows, ${hotWalletTop100Rows.length} per-hot-wallet Top-100 rows, and two exchange Top-100 lists.\n`,
);
