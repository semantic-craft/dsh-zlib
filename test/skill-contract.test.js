import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadSkills } from "../src/plugin.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skills = Object.fromEntries(loadSkills().map((skill) => [skill.name, skill]));

test("the bundled bodies regenerate from the pinned upstream snapshot", () => {
  const result = spawnSync(process.execPath, [join(root, "scripts", "sync-upstream.mjs"), "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /kindle: upstream verbatim/u);
  assert.match(result.stdout, /zlib: .*appended section/u);
});

test("zlib skill keeps the two hard rules verbatim", () => {
  const body = skills.zlib.content;
  assert.match(body, /^## Golden rule: never run a bare interactive command$/mu);
  assert.match(body, /\*\*Never run `zlib login` yourself\.\*\*/u);
  assert.match(body, /Do not pass credentials as flags either/u);
  // The agent is never told to run login; it is told to hand off.
  assert.match(body, /Open a \*\*separate terminal window\*\*/u);
  assert.doesNotMatch(body, /run `zlib login` (?:for me|now)/u);
});

test("zlib skill documents the binary-missing failure without the Homebrew tap", () => {
  const body = skills.zlib.content;
  assert.match(body, /BIN_MISSING/u);
  assert.match(body, /go install github\.com\/heartleo\/zlib\/cmd\/zlib@latest/u);
  assert.doesNotMatch(body, /brew install heartleo\/tap\/zlib/u, "the tap shadows homebrew/core/zlib");
});

test("zlib skill documents the --json fallback for older binaries", () => {
  const body = skills.zlib.content;
  assert.match(body, /If `--json` is not recognized \(older binary\), fall back to the plain table form/u);
  assert.match(body, /Older binary without `--json`/u);
});

test("zlib skill documents the logged-out handoff and the DiamWall mirror failure", () => {
  const body = skills.zlib.content;
  assert.match(body, /Not logged in\. Run: zlib login/u);
  assert.match(body, /session expired, run/u);
  assert.match(body, /## Blocked mirrors and DiamWall$/mu);
  assert.match(body, /zlib doctor --eapi --json/u);
  assert.match(body, /diamwall_blocked/u);
  assert.match(body, /ZLIB_DOMAIN/u);
});

test("kindle skill keeps its non-interactive and secret-handling rules", () => {
  const body = skills.kindle.content;
  assert.match(body, /\*\*Always pass the file path\*\*/u);
  assert.match(body, /Never ask for, paste, or echo the password/u);
  assert.match(body, /It must be an \*\*app password\*\*, not the account password/u);
  assert.match(body, /zlib kindle send/u);
});

test("neither skill instructs the agent to run an interactive form", () => {
  for (const skill of Object.values(skills)) {
    assert.doesNotMatch(skill.content, /^\s*zlib login\s*$/mu, `${skill.name} must not run login`);
    assert.doesNotMatch(skill.content, /^\s*zlib history\s*$/mu, `${skill.name} must not run bare history`);
    assert.doesNotMatch(skill.content, /^\s*zlib kindle\s*$/mu, `${skill.name} must not run bare kindle`);
  }
});
