#!/usr/bin/env node

import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next/standalone");

await Promise.all([
  cp(path.join(root, "public"), path.join(standaloneRoot, "public"), { recursive: true }),
  cp(path.join(root, ".next/static"), path.join(standaloneRoot, ".next/static"), {
    recursive: true,
  }),
  mkdir(path.join(standaloneRoot, "data"), { recursive: true }).then(() =>
    Promise.all([
      cp(
        path.join(root, "data/wallets.seed.json"),
        path.join(standaloneRoot, "data/wallets.seed.json"),
      ),
      cp(
        path.join(root, "data/snapshot.json"),
        path.join(standaloneRoot, "data/snapshot.json"),
      ),
    ]),
  ),
]);
