#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [operation, directoryArgument] = process.argv.slice(2);
if (!operation || !directoryArgument || !["create", "verify"].includes(operation)) {
  throw new Error("Usage: checkpoint-bundle.mjs <create|verify> <directory>");
}

const directory = path.resolve(directoryArgument);
const statePath = path.join(directory, "tracker-state.json");
const snapshotPath = path.join(directory, "snapshot.json");
const manifestPath = path.join(directory, "manifest.json");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readInputs() {
  const [stateBytes, snapshotBytes] = await Promise.all([
    readFile(statePath),
    readFile(snapshotPath),
  ]);
  const state = JSON.parse(stateBytes.toString("utf8"));
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  if (state.schemaVersion !== 2) throw new Error("Checkpoint requires tracker schema v2.");
  if (snapshot.schemaVersion !== 1) throw new Error("Checkpoint requires snapshot schema v1.");
  if (state.updatedAt !== snapshot.generatedAt) {
    throw new Error("Tracker state and snapshot generations do not match.");
  }
  return { state, snapshot, stateBytes, snapshotBytes };
}

if (operation === "create") {
  const { state, snapshot, stateBytes, snapshotBytes } = await readInputs();
  const manifest = {
    formatVersion: 1,
    trackerSchemaVersion: state.schemaVersion,
    snapshotSchemaVersion: snapshot.schemaVersion,
    generatedAt: state.updatedAt,
    trackerStateSha256: digest(stateBytes),
    snapshotSha256: digest(snapshotBytes),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  process.stdout.write(`Created checkpoint manifest for ${manifest.generatedAt}.\n`);
} else {
  const [{ state, snapshot, stateBytes, snapshotBytes }, manifestBytes] = await Promise.all([
    readInputs(),
    readFile(manifestPath),
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.formatVersion !== 1 ||
    manifest.trackerSchemaVersion !== state.schemaVersion ||
    manifest.snapshotSchemaVersion !== snapshot.schemaVersion ||
    manifest.generatedAt !== state.updatedAt ||
    manifest.trackerStateSha256 !== digest(stateBytes) ||
    manifest.snapshotSha256 !== digest(snapshotBytes)
  ) {
    throw new Error("Checkpoint manifest validation failed.");
  }
  process.stdout.write(`Verified checkpoint for ${manifest.generatedAt}.\n`);
}
