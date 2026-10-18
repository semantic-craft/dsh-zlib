import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = "/Applications/DeepSeek Harness.app";
const available = existsSync(join(app, "Contents", "Resources", "app.asar"));

test(
  "the installed host accepts this bundle and refuses incompatible engines.dsh",
  { skip: available ? false : "DeepSeek Harness app not installed on this machine", timeout: 120_000 },
  () => {
    const result = spawnSync(process.execPath, [join(root, "scripts", "verify-host.mjs")], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /engines\.dsh accepts this package/u);
    assert.match(result.stdout, /engines\.dsh far above the host is refused/u);
    assert.match(result.stdout, /bundle patch inserts exactly one entry row/u);
    assert.match(result.stdout, /startup skips a bundle whose engines\.dsh does not match/u);
  },
);
