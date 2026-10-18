import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { MarketIndexError, marketInstallTarget, parseMarketIndex } from "@deepseek-ai/dsh-plugin-market-index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexUrl = "https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json";
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const raw = JSON.parse(readFileSync(join(root, "market", "index.json"), "utf8"));

test("the host validator accepts market/index.json as format 1", () => {
  assert.throws(() => parseMarketIndex({ ...raw, format: 2 }, indexUrl), MarketIndexError);
  const index = parseMarketIndex(raw, indexUrl);
  assert.equal(index.format, 1);
  assert.deepEqual(index.title.en, "dsh-zlib");
});

test("the index version is the package version with the same DSH requirement", () => {
  const index = parseMarketIndex(raw, indexUrl);
  const plugin = index.plugins.find((entry) => entry.name === packageJson.name);
  assert.ok(plugin, `index lists ${packageJson.name}`);
  const version = plugin.versions.find((entry) => entry.version === packageJson.version);
  assert.ok(version, `index lists ${packageJson.version}`);
  assert.equal(version.engines.dsh, packageJson.engines.dsh);
  assert.equal(typeof version.publishTimestamp, "number");
});

test("marketInstallTarget produces the commit-pinned git spec the market installs", () => {
  const index = parseMarketIndex(raw, indexUrl);
  const plugin = index.plugins.find((entry) => entry.name === packageJson.name);
  const [version] = plugin.versions;
  assert.equal(version.source.type, "git");
  const target = marketInstallTarget(plugin.name, version);
  assert.match(target.spec, /^git\+https:\/\/\S+\.git#[0-9a-f]{40}$/u);
  assert.equal(target.spec, `git+${version.source.url}.git#${version.source.commit}`);
  assert.equal(target.registry, undefined, "a git target names no registry");
});

test("the pinned commit really is this package at this version", () => {
  const index = parseMarketIndex(raw, indexUrl);
  const version = index.plugins.find((entry) => entry.name === packageJson.name).versions[0];
  const commit = version.source.commit;
  // git cat-file is the judge: the commit object must exist locally and carry the
  // same package.json version the index claims for it.
  execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root });
  const manifest = execFileSync("git", ["show", `${commit}:package.json`], { cwd: root, encoding: "utf8" });
  assert.equal(JSON.parse(manifest).version, version.version);
});

test("the index URL and repository URL are canonical https URLs", () => {
  const index = parseMarketIndex(raw, indexUrl);
  const plugin = index.plugins.find((entry) => entry.name === packageJson.name);
  assert.equal(plugin.repository.url, "https://github.com/semantic-craft/dsh-zlib");
  assert.equal(plugin.repository.directory, undefined, "the package is the repository root");
});
