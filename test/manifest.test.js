import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { apply, inject, loadSkills, name } from "../src/plugin.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const packageJson = JSON.parse(read("package.json"));

test("the package declares the DSH bundle manifest the host reads", () => {
  assert.equal(packageJson.dsh.manifestVersion, 1);
  assert.equal(packageJson.dsh.bundle.patch, "./cordis.patch.yml");
  assert.ok(existsSync(join(root, packageJson.dsh.bundle.patch)), "bundle patch file must exist");
  assert.equal(packageJson.main, "./src/plugin.js");
  assert.ok(existsSync(join(root, packageJson.main)), "entry module must exist");
});

test("engines.dsh is a SemVer range, not a hand-rolled harnessRange field", () => {
  assert.equal(typeof packageJson.engines.dsh, "string");
  assert.match(packageJson.engines.dsh, /^(?:[<>]=?|=|\^|~)?\d+\.\d+\.\d+/u);
  assert.equal(packageJson.dsh.harnessRange, undefined);
  // The running host (0.2.1-rc.2) must be inside the range; verify-host.mjs proves
  // it with the host's own evaluatePluginCompatibility().
  assert.ok(packageJson.engines.dsh.includes("<0.3.0"), "the bundle is built for the DSH 0.2 line");
});

test("the bundle patch inserts exactly one row: this package's entry module", () => {
  const patch = read("cordis.patch.yml");
  assert.equal(patch.match(/^\s*-\s*insert:/gmu)?.length, 1, "exactly one insert");
  assert.equal(patch.match(/^\s*-\s*id:/gmu)?.length, 1, "exactly one row");
  assert.match(patch, /id: dsh-zlib\b/u);
  assert.match(patch, new RegExp(`name: ${packageJson.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "u"));
  assert.doesNotMatch(patch, /config:|disabled:|include:/u, "the patch only inserts a module");
});

test("the entry module exports the cordis plugin contract without new capabilities", async () => {
  const module = await import("../src/plugin.js");
  assert.equal(module.name, "dsh-zlib");
  assert.deepEqual(module.inject, ["skills"]);
  assert.equal(typeof module.apply, "function");
  assert.match(module.apply.toString(), /^function apply\(\w+, \w+ = \{\}\)/u, "apply(ctx, config = {})");
  assert.deepEqual(
    Object.keys(module).sort(),
    ["apply", "defaultSkillsDir", "inject", "loadSkills", "name", "parseSkillDocument"],
    "no unexpected exports (no MCP server, no commands, no services)",
  );
});

test("the package ships exactly the two upstream skills and nothing executable else", () => {
  const skillDirs = readdirSync(join(root, "skills")).filter((entry) =>
    statSync(join(root, "skills", entry)).isDirectory(),
  );
  assert.deepEqual(skillDirs.sort(), ["kindle", "zlib"]);
  assert.deepEqual(loadSkills().map((skill) => skill.name), ["kindle", "zlib"]);
  assert.equal(packageJson.dsh.client, undefined, "a skills-only bundle declares no client surface");
  assert.equal(packageJson.dsh.mcpServers, undefined, "a skills-only bundle declares no MCP server");
  assert.equal(packageJson.bin, undefined, "a bundle is not a CLI");
});

test("registration is still the only effect of mounting", () => {
  const registered = [];
  const ctx = {
    skills: { register: (skill) => registered.push(skill) },
    logger: { warn: () => {}, debug: () => {} },
  };
  apply(ctx);
  assert.deepEqual(registered.map((skill) => skill.name), ["kindle", "zlib"]);
  assert.equal(name, "dsh-zlib");
  assert.deepEqual(inject, ["skills"]);
});
