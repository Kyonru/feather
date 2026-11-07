import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalTrain,
  parseArgs,
  tagFor,
  validateTrainVersions,
} from "../release-train.mjs";

test("release train aliases resolve to the workflow vocabulary", () => {
  assert.equal(canonicalTrain("cli"), "cli");
  assert.equal(canonicalTrain("inspector"), "desktop");
  assert.equal(canonicalTrain("extension"), "ext");
  assert.equal(canonicalTrain("studio"), "studio");
  assert.equal(canonicalTrain("unknown"), null);
});

test("release tags are derived for every independent train", () => {
  assert.equal(tagFor("cli", "4.0.1"), "cli-v4.0.1");
  assert.equal(tagFor("runtime", "4.0.0"), "runtime-v4.0.0");
  assert.equal(tagFor("desktop", "4.0.0"), "desktop-v4.0.0");
  assert.equal(tagFor("ext", "4.0.0"), "ext-v4.0.0");
  assert.equal(tagFor("studio", "0.1.0-rc.1"), "studio-v0.1.0-rc.1");
  assert.equal(tagFor("platform", "4.1.0"), "v4.1.0");
  assert.throws(() => tagFor("cli", "latest"), /Invalid semver/);
});

test("release options are dry-run by default and require an explicit push", () => {
  assert.deepEqual(parseArgs(["desktop"]), {
    train: "desktop",
    version: null,
    remote: "origin",
    push: false,
    explicitDryRun: false,
    json: false,
    help: false,
  });
  assert.deepEqual(parseArgs(["studio", "--", "--version", "0.2.0", "--push"]), {
    train: "studio",
    version: "0.2.0",
    remote: "origin",
    push: true,
    explicitDryRun: false,
    json: false,
    help: false,
  });
  assert.throws(() => parseArgs(["cli", "--push", "--dry-run"]), /either --push or --dry-run/);
});

test("all files owned by a train must match before release", () => {
  assert.equal(
    validateTrainVersions("desktop", {
      "package.json": "4.0.0",
      "Cargo.toml": "4.0.0",
      "tauri.conf.json": "4.0.0",
    }),
    "4.0.0",
  );
  assert.throws(
    () =>
      validateTrainVersions(
        "studio",
        { "package.json": "0.2.0", "Cargo.toml": "0.1.0" },
        "0.2.0",
      ),
    /set-version\.sh studio 0\.2\.0/,
  );
});
