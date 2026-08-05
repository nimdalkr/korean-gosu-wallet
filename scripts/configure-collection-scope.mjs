#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TOP100_SCHEDULE = "7 1-3,5-7,9-11,13-15,17,19,21-23 * * *";
const schedule = process.env.SCHEDULE_EXPRESSION ?? "";
const refreshScope = schedule === TOP100_SCHEDULE ? "top100" : "all";
const lines = [`REFRESH_SCOPE=${refreshScope}`];

if (refreshScope === "top100") {
  const seed = JSON.parse(
    await readFile(path.join(process.cwd(), "data/wallets.seed.json"), "utf8"),
  );
  const addresses = seed.wallets
    .filter((wallet) => wallet.inTop100)
    .map((wallet) => wallet.address.toLowerCase());
  if (addresses.length !== 200) {
    throw new Error(`Expected 200 Top-100 cohort addresses, got ${addresses.length}.`);
  }
  lines.push(`WALLET_FILTER=${addresses.join(",")}`);
}

if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `${lines.join("\n")}\n`, "utf8");
}
process.stdout.write(
  `Configured ${refreshScope} collection scope${
    refreshScope === "top100" ? " for 200 wallets" : " for all 406 wallets"
  }.\n`,
);
