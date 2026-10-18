#!/usr/bin/env node
/**
 * Validate market/index.json with the host's own rule set and derive its
 * install target, without any DSH installation being present.
 *
 *   parseMarketIndex()      - the exact validator @deepseek-ai/dsh-plugin-market
 *                             runs on every index it reads; a violation throws
 *                             MarketIndexError carrying the JSON path.
 *   marketInstallTarget()   - the exact install arguments the market hands to
 *                             plugin_manager's install_bundle.
 *
 * Usage:
 *   node scripts/validate-market.mjs            # validate + list targets
 *   node scripts/validate-market.mjs --json     # machine-readable result
 *   node scripts/validate-market.mjs --resolve  # also prove pnpm can resolve the
 *                                               # git target (network; clones the
 *                                               # pinned commit)
 *
 * The index URL passed to parseMarketIndex is where the file is intended to be
 * served; relative icon references resolve against it. Override with
 * DSH_ZLIB_INDEX_URL.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MarketIndexError, marketInstallTarget, parseMarketIndex } from "@deepseek-ai/dsh-plugin-market-index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexUrl =
  process.env.DSH_ZLIB_INDEX_URL ??
  "https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json";
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const raw = JSON.parse(readFileSync(join(root, "market", "index.json"), "utf8"));

let index;
try {
  index = parseMarketIndex(raw, indexUrl);
} catch (error) {
  if (error instanceof MarketIndexError) {
    console.error(`market/index.json is not format 1: ${error.path} ${error.reason}`);
    process.exit(1);
  }
  throw error;
}

const problems = [];
const targets = [];
for (const plugin of index.plugins) {
  for (const version of plugin.versions) {
    const target = marketInstallTarget(plugin.name, version);
    targets.push({ name: plugin.name, version: version.version, ...target });
    if (version.source.type === "git") {
      if (!/^git\+https:\/\/\S+#[0-9a-f]{40}$/u.test(target.spec)) {
        problems.push(`${plugin.name}@${version.version}: git target is not commit-pinned: ${target.spec}`);
      }
    }
  }
}

const own = index.plugins.find((plugin) => plugin.name === packageJson.name);
if (own === undefined) problems.push(`index does not list ${packageJson.name}`);
else {
  const version = own.versions.find((entry) => entry.version === packageJson.version);
  if (version === undefined) problems.push(`index does not list ${packageJson.name}@${packageJson.version}`);
  else if ((version.engines.dsh ?? "") !== packageJson.engines.dsh) {
    problems.push(
      `index engines.dsh ${JSON.stringify(version.engines.dsh)} != package.json engines.dsh ${JSON.stringify(packageJson.engines.dsh)}`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL - ${problem}`);
  process.exit(1);
}

const gitTarget = targets.find((target) => target.spec.startsWith("git+"))?.spec;
if (process.argv.includes("--resolve") && gitTarget !== undefined) {
  const dir = mkdtempSync(join(tmpdir(), "dsh-zlib-market-"));
  try {
    writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "market-resolve", private: true })}\n`);
    // pnpm's own resolver, not a guess: the lockfile keeps the commit it resolved.
    execFileSync("pnpm", ["add", "--lockfile-only", gitTarget], { cwd: dir, stdio: "inherit" });
    const lock = readFileSync(join(dir, "pnpm-lock.yaml"), "utf8");
    const commit = /#([0-9a-f]{40})/u.exec(gitTarget)?.[1];
    if (commit === undefined || !lock.includes(commit)) {
      problems.push(`pnpm did not resolve the pinned commit ${commit} in its lockfile`);
    }
    console.log(`ok - pnpm resolved ${gitTarget}`);
  } catch {
    problems.push(`pnpm could not resolve ${gitTarget}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ indexUrl, plugins: index.plugins.length, targets, problems }, null, 2));
} else {
  console.log(`ok - parseMarketIndex accepted ${indexUrl}`);
  for (const target of targets) {
    console.log(`target - ${target.name}@${target.version}: ${target.spec}${target.registry === undefined ? "" : ` (registry ${target.registry})`}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL - ${problem}`);
  process.exit(1);
}
