#!/usr/bin/env node
/**
 * sync-upstream.mjs - keep the bundled skill text identical to upstream heartleo/zlib.
 *
 * The two skill bodies in the skills directory are upstream text plus exactly the
 * documented adaptations (see docs/upstream.md). upstream/SOURCE.json records the
 * pinned commit and the sha256 of every vendored file, and
 * upstream/heartleo-zlib-<commit>/ holds the untouched upstream snapshot.
 *
 * Usage:
 *   node scripts/sync-upstream.mjs           network: fetch the pinned commit from
 *                                            raw.githubusercontent.com, rewrite the
 *                                            vendored snapshot, then regenerate the
 *                                            bundled skills by applying the documented
 *                                            adaptations
 *   node scripts/sync-upstream.mjs --check   offline: verify the vendored snapshot
 *                                            against SOURCE.json, regenerate the
 *                                            bundled skills in memory, exit 1 on drift
 *
 * Standard library only; runs on the Node version the plugin already requires (>=20).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_ROOT = join(PACKAGE_ROOT, "upstream");
const SOURCE_PATH = join(UPSTREAM_ROOT, "SOURCE.json");
const SKILLS_ROOT = join(PACKAGE_ROOT, "skills");
const RAW_BASE = "https://raw.githubusercontent.com";
const SNAPSHOT_DIR = /^heartleo-zlib-[0-9a-f]{40}$/;
const SKILL_SOURCE = /^plugins\/zlib\/skills\/([^/]+)\/SKILL\.md$/;

/**
 * The complete, documented set of differences between upstream text and the
 * bundled skills. --check applies exactly these rules to the vendored upstream
 * text and compares the result with the bundled SKILL.md files, so any other
 * edit fails the check. docs/upstream.md records each anchor and its replacement.
 */
const ADAPTATIONS = [
  {
    id: "zlib:kindle -> kindle",
    // Upstream is a Claude Code plugin, so it addresses its sibling skill as
    // zlib:kindle, sometimes with a leading slash (the slash-command form).
    // DSH registers skills flat, with no plugin namespace, so the plain DSH
    // skill name "kindle" is the only spelling that resolves here.
    pattern: /\/?zlib:kindle/g,
    replacement: "kindle",
  },
  {
    id: "homebrew tap option removed",
    // The binary-missing handoff must not steer the agent at
    // heartleo/tap/zlib: that tap ships a formula named zlib and shadows
    // homebrew/core/zlib (see README). The go install sentence stays.
    pattern: / \(or `brew install heartleo\/tap\/zlib`\)/g,
    replacement: "",
  },
];

/**
 * New text appended after the last upstream line. Only the zlib skill needs it:
 * it documents host-verified failure surfaces upstream's SKILL.md does not cover -
 * DiamWall-blocked mirrors, EAPI/domain authentication and configuration errors,
 * and the release-build download-directory caveat - using only commands upstream
 * already documents (zlib doctor, the login handoff, ZLIB_DOMAIN, --dir). Exactly
 * one blank line separates it from the upstream text, and the block ends with one
 * newline.
 */
const APPENDED_SECTIONS = new Map([
  [
    "zlib",
    [
      "",
      "## Blocked mirrors and DiamWall",
      "",
      "Most current Z-Library web domains put automated requests behind DiamWall, so a mirror can answer with HTTP 307, 513 or 517, `Access Denied | DiamWall`, or a JS challenge instead of book data. Before blaming the query, run `zlib doctor --eapi --json` and pick a domain whose `status` is `healthy`, or `challenged` — a challenged domain is usable because the client solves its JS proof-of-work automatically. Domains reported `diamwall_blocked`, `http_error`, `redirect_loop`, or `network_error` are not usable. Have the user set `ZLIB_DOMAIN=https://<that domain>` in `~/.config/zlib/.env` (the network-error bullet above shows the file), then retry. Signing in is still the user's own step.",
      "",
      "## Session and domain errors",
      "",
      "- **`EAPI profile failed`, `EAPI history failed`, `EAPI search failed`, or `Invalid credentials`** — an `--eapi` session that lapsed reports these instead of `Not logged in` or `session expired`. Treat any of them as the same authentication failure and give the separate-terminal `zlib login` handoff from preflight #2; never run login yourself.",
      "- **`Domain is not configured` or `Invalid Z-Library domain`** — a mirror configuration problem, not a query problem. Have the user set `ZLIB_DOMAIN` in `~/.config/zlib/.env` (the network-error bullet above shows the file). If the message suggests `zlib login --domain`, hand that command to the user instead of running it.",
      "",
      "## Download directory on release builds",
      "",
      "`ZLIB_DOWNLOAD_DIR` is newer than the latest release build: release builds through v0.0.8 ignore it even though this skill documents the fallback. Check `zlib download --help` first — if `--dir` is the only directory flag (default `.`), always pass `--dir` explicitly, treat the `Saved to:` line as the only authority on where the file landed, and do not offer to make the variable permanent.",
      "",
    ].join("\n"),
  ],
]);

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const toPosix = (path) => path.split(sep).join("/");
const rel = (absolutePath) => toPosix(relative(PACKAGE_ROOT, absolutePath));

function fail(message) {
  throw new Error(message);
}

function repoSlug(source) {
  const url = new URL(source.repository);
  const [owner, repo] = url.pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/, "")
    .split("/");
  if (!owner || !repo) fail("SOURCE.json: unsupported repository URL " + source.repository);
  return owner + "/" + repo;
}

/** Accept both "path/to/file" and {path, sha256?, bytes?} entries. */
function normalizeFiles(entries) {
  const seen = new Set();
  return entries.map((entry) => {
    const path = typeof entry === "string" ? entry : entry && entry.path;
    if (typeof path !== "string" || path === "") {
      fail("upstream/SOURCE.json: every files[] entry needs a path");
    }
    if (path.startsWith("/") || path.split("/").includes("..") || path.includes("\\")) {
      fail("upstream/SOURCE.json: unsafe file path " + path);
    }
    if (seen.has(path)) fail("upstream/SOURCE.json: duplicate file " + path);
    seen.add(path);
    const file = { path };
    if (entry && typeof entry === "object") {
      if (typeof entry.sha256 === "string") file.sha256 = entry.sha256;
      if (Number.isInteger(entry.bytes)) file.bytes = entry.bytes;
    }
    return file;
  });
}

function readSource() {
  if (!existsSync(SOURCE_PATH)) {
    fail("missing upstream/SOURCE.json (provenance record must exist before syncing)");
  }
  let source;
  try {
    source = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
  } catch (error) {
    fail("upstream/SOURCE.json: invalid JSON (" + error.message + ")");
  }
  for (const key of ["repository", "commit", "ref", "fetchedAt", "files"]) {
    if (!(key in source)) fail("upstream/SOURCE.json: missing " + key);
  }
  if (typeof source.repository !== "string") fail("upstream/SOURCE.json: repository must be a URL");
  if (typeof source.commit !== "string" || !/^[0-9a-f]{40}$/.test(source.commit)) {
    fail("upstream/SOURCE.json: commit must be a full 40-character lowercase hex SHA");
  }
  if (typeof source.ref !== "string" || source.ref === "") {
    fail("upstream/SOURCE.json: ref must be a branch or tag name");
  }
  if (typeof source.fetchedAt !== "string") fail("upstream/SOURCE.json: fetchedAt must be a string");
  if (!Array.isArray(source.files) || source.files.length === 0) {
    fail("upstream/SOURCE.json: files must be a non-empty array");
  }
  source.files = normalizeFiles(source.files);
  return source;
}

function vendoredRoot(source) {
  return join(UPSTREAM_ROOT, "heartleo-zlib-" + source.commit);
}

function walkFiles(root) {
  const files = [];
  if (!existsSync(root)) return files;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = join(dir, entry.name);
      if (entry.isSymbolicLink()) fail("refusing to traverse symlink " + rel(absolutePath));
      if (entry.isDirectory()) stack.push(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
      else fail("unsupported filesystem entry " + rel(absolutePath));
    }
  }
  return files.sort();
}

function pruneEmptyDirs(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(root, entry.name);
    pruneEmptyDirs(child);
    if (readdirSync(child).length === 0) rmSync(child, { recursive: true, force: true });
  }
}

/** Write data only when it differs from what is on disk; record the change. */
function writeIfChanged(absolutePath, data, changed) {
  let before = null;
  try {
    before = readFileSync(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (before !== null && before.equals(data)) return false;
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, data);
  changed.push(rel(absolutePath));
  return true;
}

/** Apply one skill's documented adaptations to its upstream bytes. */
function adaptSkill(name, upstreamData) {
  let text = upstreamData.toString("utf8");
  for (const adaptation of ADAPTATIONS) {
    text = text.replace(adaptation.pattern, adaptation.replacement);
  }
  const appended = APPENDED_SECTIONS.get(name);
  if (appended !== undefined) text += appended;
  return Buffer.from(text, "utf8");
}

/**
 * Turn upstream skill files into bundled skill files.
 * @param {Array<{path: string, data: Buffer}>} files vendored files with bytes.
 * @returns {Map<string, Buffer>} package-relative path -> expected bytes.
 */
function generateSkills(files) {
  const expected = new Map();
  for (const file of files) {
    const match = SKILL_SOURCE.exec(file.path);
    if (!match) continue;
    expected.set("skills/" + match[1] + "/SKILL.md", adaptSkill(match[1], file.data));
  }
  if (expected.size === 0) {
    fail("upstream/SOURCE.json: files[] lists no plugins/zlib/skills/*/SKILL.md");
  }
  return expected;
}

/** Human-readable list of the adaptations applied to each vendored skill. */
function adaptationSummary(files) {
  const lines = [];
  for (const file of files) {
    const match = SKILL_SOURCE.exec(file.path);
    if (!match) continue;
    const name = match[1];
    const text = file.data.toString("utf8");
    const applied = [];
    for (const adaptation of ADAPTATIONS) {
      const count = (text.match(adaptation.pattern) || []).length;
      if (count > 0) applied.push(count + "x " + adaptation.id);
    }
    if (APPENDED_SECTIONS.has(name)) applied.push("1x appended section");
    lines.push("  " + name + ": " + (applied.length === 0 ? "upstream verbatim" : applied.join("; ")));
  }
  return lines;
}

async function fetchUpstream(source, path) {
  const url = RAW_BASE + "/" + repoSlug(source) + "/" + source.commit + "/" + path;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) fail("GET " + url + " -> HTTP " + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0) fail("GET " + url + " returned an empty body");
  return data;
}

function recordSource(source, files, now) {
  const nextFiles = files.map((file) => ({ path: file.path, sha256: file.sha256, bytes: file.bytes }));
  const recorded = JSON.stringify(
    source.files.map((file) => ({ path: file.path, sha256: file.sha256, bytes: file.bytes })),
  );
  return {
    repository: source.repository,
    commit: source.commit,
    ref: source.ref,
    // Keep the original timestamp when the pinned content did not move, so a
    // routine sync does not rewrite the provenance record.
    fetchedAt:
      recorded === JSON.stringify(nextFiles) && source.fetchedAt !== "" ? source.fetchedAt : now,
    files: nextFiles,
  };
}

async function sync() {
  const source = readSource();
  const root = vendoredRoot(source);
  const fetched = [];
  for (const file of source.files) {
    const data = await fetchUpstream(source, file.path);
    fetched.push({ path: file.path, data, sha256: sha256(data), bytes: data.length });
  }

  const changed = [];
  for (const file of fetched) writeIfChanged(join(root, file.path), file.data, changed);

  const expectedVendored = new Set(fetched.map((file) => join(root, file.path)));
  for (const absolutePath of walkFiles(root)) {
    if (expectedVendored.has(absolutePath)) continue;
    rmSync(absolutePath, { force: true });
    changed.push(rel(absolutePath));
  }
  pruneEmptyDirs(root);

  for (const entry of readdirSync(UPSTREAM_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SNAPSHOT_DIR.test(entry.name)) continue;
    const stale = join(UPSTREAM_ROOT, entry.name);
    if (stale === root) continue;
    rmSync(stale, { recursive: true, force: true });
    changed.push(rel(stale) + "/");
  }

  const nextSource = recordSource(source, fetched, new Date().toISOString());
  writeIfChanged(SOURCE_PATH, Buffer.from(JSON.stringify(nextSource, null, 2) + "\n", "utf8"), changed);

  const expectedSkills = generateSkills(fetched);
  for (const [path, data] of expectedSkills) writeIfChanged(join(PACKAGE_ROOT, path), data, changed);
  const expectedSkillFiles = new Set(
    [...expectedSkills.keys()].map((path) => join(PACKAGE_ROOT, path)),
  );
  for (const absolutePath of walkFiles(SKILLS_ROOT)) {
    if (expectedSkillFiles.has(absolutePath)) continue;
    rmSync(absolutePath, { force: true });
    changed.push(rel(absolutePath));
  }
  pruneEmptyDirs(SKILLS_ROOT);

  console.log("sync-upstream: " + repoSlug(source) + "@" + source.commit + " (ref " + source.ref + ")");
  console.log("  fetched " + fetched.length + " file(s) from " + RAW_BASE);
  if (changed.length === 0) {
    console.log("  all files up to date");
  } else {
    console.log("  changed " + changed.length + " file(s):");
    for (const path of changed) console.log("    " + path);
  }
  return 0;
}

function check() {
  const source = readSource();
  const root = vendoredRoot(source);
  if (!existsSync(root)) {
    fail("missing vendored snapshot " + rel(root) + " (run node scripts/sync-upstream.mjs)");
  }

  const problems = [];
  const vendored = [];
  for (const file of source.files) {
    const absolutePath = join(root, file.path);
    let data;
    try {
      data = readFileSync(absolutePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      problems.push("missing " + rel(absolutePath));
      continue;
    }
    const digest = sha256(data);
    if (file.sha256 === undefined) {
      problems.push(rel(absolutePath) + ": SOURCE.json records no sha256");
    } else if (digest !== file.sha256) {
      problems.push(
        "sha256 mismatch " + rel(absolutePath) + ": SOURCE.json " + file.sha256 + ", on disk " + digest,
      );
    }
    if (file.bytes !== undefined && file.bytes !== data.length) {
      problems.push(
        "size mismatch " + rel(absolutePath) + ": SOURCE.json " + file.bytes + ", on disk " + data.length,
      );
    }
    vendored.push({ path: file.path, data });
  }

  const expectedVendored = new Set(source.files.map((file) => join(root, file.path)));
  for (const absolutePath of walkFiles(root)) {
    if (!expectedVendored.has(absolutePath)) {
      problems.push("unexpected vendored file " + rel(absolutePath));
    }
  }
  for (const entry of readdirSync(UPSTREAM_ROOT, { withFileTypes: true })) {
    const absolutePath = join(UPSTREAM_ROOT, entry.name);
    if (absolutePath === SOURCE_PATH || absolutePath === root) continue;
    if (SNAPSHOT_DIR.test(entry.name)) problems.push("stale snapshot " + rel(absolutePath) + "/");
    else problems.push("unexpected path under upstream/ " + rel(absolutePath));
  }

  let expectedSkills = new Map();
  const skillSourceCount = source.files.filter((file) => SKILL_SOURCE.test(file.path)).length;
  const vendoredSkills = vendored.filter((file) => SKILL_SOURCE.test(file.path));
  if (vendoredSkills.length === 0) {
    problems.push("no vendored skill files found; cannot regenerate skills/");
  } else if (vendoredSkills.length === skillSourceCount) {
    expectedSkills = generateSkills(vendored);
  }

  for (const [path, expected] of expectedSkills) {
    const absolutePath = join(PACKAGE_ROOT, path);
    let actual;
    try {
      actual = readFileSync(absolutePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      problems.push("missing " + path);
      continue;
    }
    if (!actual.equals(expected)) {
      problems.push("out of date " + path + " (upstream text + documented adaptations)");
    }
  }
  const expectedSkillFiles = new Set(
    [...expectedSkills.keys()].map((path) => join(PACKAGE_ROOT, path)),
  );
  for (const absolutePath of walkFiles(SKILLS_ROOT)) {
    if (!expectedSkillFiles.has(absolutePath)) {
      problems.push("unexpected skill file " + rel(absolutePath));
    }
  }

  console.log(
    "sync-upstream --check: " + repoSlug(source) + "@" + source.commit + " (ref " + source.ref + ")",
  );
  if (problems.length === 0) {
    console.log(
      "  check: clean (" +
        source.files.length +
        " vendored file(s) match SOURCE.json; " +
        expectedSkills.size +
        " bundled skill body/bodies regenerate from upstream)",
    );
    for (const line of adaptationSummary(vendored)) console.log(line);
    return 0;
  }
  console.log("  check: FAILED (" + problems.length + " difference(s))");
  for (const problem of problems) console.log("    " + problem);
  console.log("  fix: node scripts/sync-upstream.mjs");
  return 1;
}

try {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    fail("unknown argument(s): " + unknown.join(" ") + " (only --check is supported)");
  }
  if (args.includes("--check")) {
    if (!statSync(UPSTREAM_ROOT).isDirectory()) fail("missing upstream/ directory");
    process.exitCode = check();
  } else {
    process.exitCode = await sync();
  }
} catch (error) {
  console.error("sync-upstream: " + error.message);
  process.exitCode = 1;
}
