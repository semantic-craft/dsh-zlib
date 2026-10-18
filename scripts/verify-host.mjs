#!/usr/bin/env node
/**
 * Verify this plugin against the *real* DeepSeek Harness host, not a model of it.
 *
 * The host's rules live inside app.asar and are only readable by Electron's
 * patched Node. This script therefore re-executes itself with
 * ELECTRON_RUN_AS_NODE=1 and the installed Electron binary, imports
 * @deepseek-ai/dsh-app-boot from app.asar, and asks the host's own functions:
 *
 *   1. evaluatePluginCompatibility(manifest) accepts this package's engines.dsh
 *      on the running DSH version;
 *   2. the same function rejects a copy whose engines.dsh cannot match, naming
 *      engines.dsh in the unmet requirements;
 *   3. loadProfileDirectory() loads a scratch profile whose only bundle is this
 *      package, proving dsh.bundle.patch resolves and contributes exactly the
 *      one insert row the plugin declares;
 *   4. the same loader *skips* a bundle with an unsatisfiable engines.dsh and
 *      reports it in skippedBundles (the startup refusal path).
 *
 * Exit code 0 only when every host answer matches. Run with:
 *   node scripts/verify-host.mjs        (or: pnpm verify:host)
 *
 * Environment overrides: DSH_ELECTRON (binary), DSH_ASAR (app.asar), DSH_BIN_NAME.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronBinary =
  process.env.DSH_ELECTRON ?? "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";
const asarPath =
  process.env.DSH_ASAR ?? "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar";
const binName = process.env.DSH_BIN_NAME ?? "dsh";

if (process.versions.electron === undefined) {
  const child = spawnSync(electronBinary, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const appBootUrl = pathToFileURL(
  join(asarPath, "dsh", "node_modules", "@deepseek-ai", "dsh-app-boot", "lib", "index.js"),
);
const appBoot = await import(appBootUrl.href);
const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

const failures = [];
function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures.push(name);
  console.log(`${ok ? "ok" : "FAIL"} - ${name}${detail === undefined ? "" : `: ${detail}`}`);
  return ok;
}

const runtimeVersion = appBoot.getDshRuntimeVersion();
console.log(`# host dsh ${runtimeVersion}, electron ${process.versions.electron}`);

// 1. This package is compatible with the running host.
const accepted = appBoot.evaluatePluginCompatibility(packageJson);
check(
  "engines.dsh accepts this package on the running host",
  accepted === undefined,
  accepted === undefined ? "no unmet requirements" : JSON.stringify(accepted.requirements),
);

// 2. An unsatisfiable engines.dsh is refused, keyed engines.dsh (install-time refusal).
const refused = appBoot.evaluatePluginCompatibility({
  ...packageJson,
  engines: { ...packageJson.engines, dsh: ">=99.0.0" },
});
check(
  "engines.dsh far above the host is refused",
  refused !== undefined && refused.requirements["engines.dsh"] === ">=99.0.0",
  refused === undefined ? "not refused" : JSON.stringify(refused.requirements),
);

// 3. A scratch profile loads this bundle and gets exactly the one declared row.
const scratch = mkdtempSync(join(tmpdir(), "dsh-zlib-verify-"));
try {
  const profileDir = join(scratch, "profile");
  mkdirSync(join(profileDir, "node_modules"), { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify(
      {
        name: "dsh-zlib-verify-profile",
        private: true,
        dsh: { profile: { bundles: [packageJson.name] } },
      },
      null,
      2,
    )}\n`,
  );
  symlinkSync(packageDir, join(profileDir, "node_modules", packageJson.name), "dir");
  const loaded = appBoot.loadProfileDirectory(binName, profileDir, join(asarPath, "dsh", "package.json"), {
    userLayer: false,
  });
  const rows = loaded.layers.flatMap((layer) => layer.patches).flatMap((patch) => patch.insert ?? []);
  check(
    "scratch profile loads the bundle without skipping it",
    loaded.skippedBundles.length === 0,
    JSON.stringify(loaded.skippedBundles),
  );
  check(
    "bundle patch inserts exactly one entry row naming this package",
    rows.length === 1 && rows[0].name === packageJson.name,
    JSON.stringify(rows),
  );

  // 4. The same loader skips an incompatible bundle at startup.
  const badDir = join(scratch, "bad", packageJson.name);
  mkdirSync(badDir, { recursive: true });
  cpSync(join(packageDir, "package.json"), join(badDir, "package.json"));
  cpSync(join(packageDir, "cordis.patch.yml"), join(badDir, "cordis.patch.yml"));
  const badManifest = JSON.parse(readFileSync(join(badDir, "package.json"), "utf8"));
  badManifest.engines = { ...badManifest.engines, dsh: ">=99.0.0" };
  writeFileSync(join(badDir, "package.json"), `${JSON.stringify(badManifest, null, 2)}\n`);
  const badProfileDir = join(scratch, "bad-profile");
  mkdirSync(join(badProfileDir, "node_modules"), { recursive: true });
  writeFileSync(
    join(badProfileDir, "package.json"),
    `${JSON.stringify(
      {
        name: "dsh-zlib-verify-bad-profile",
        private: true,
        dsh: { profile: { bundles: [packageJson.name] } },
      },
      null,
      2,
    )}\n`,
  );
  symlinkSync(badDir, join(badProfileDir, "node_modules", packageJson.name), "dir");
  const badLoaded = appBoot.loadProfileDirectory(
    binName,
    badProfileDir,
    join(asarPath, "dsh", "package.json"),
    { userLayer: false },
  );
  check(
    "startup skips a bundle whose engines.dsh does not match",
    badLoaded.skippedBundles.length === 1 &&
      badLoaded.skippedBundles[0].packageName === packageJson.name &&
      /engines\.dsh/.test(badLoaded.skippedBundles[0].reason),
    JSON.stringify(badLoaded.skippedBundles),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} host check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nall host checks passed");
