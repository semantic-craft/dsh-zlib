#!/usr/bin/env node
/**
 * Generate market/index.json (plugin market index format 1) from package.json
 * plus the repository's current git commit.
 *
 * The install target is a commit-pinned Git source, because that is the only
 * mutable-code-free way to distribute a DSH bundle that is not in a registry.
 * marketInstallTarget() turns this entry into
 *   git+https://<repo>.git#<40-hex-commit>
 * so every install of this version resolves to exactly this tree.
 *
 * Usage:
 *   node scripts/finalize-market.mjs             # write market/index.json
 *   node scripts/finalize-market.mjs --print     # validation URL + target only
 *   DSH_ZLIB_REPO_URL=https://github.com/you/dsh-zlib node scripts/finalize-market.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const repoUrl = process.env.DSH_ZLIB_REPO_URL ?? "https://github.com/semantic-craft/dsh-zlib";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error(`not a 40-hex commit: ${commit}`);
const commitTimestamp = Number(
  execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
);
if (!Number.isInteger(commitTimestamp) || commitTimestamp < 0) throw new Error("cannot read commit timestamp");

const index = {
  format: 1,
  title: { en: "dsh-zlib", zh: "dsh-zlib" },
  description: {
    en: "DeepSeek Harness plugin market for the zlib bundle.",
    zh: "zlib 插件的 DeepSeek Harness 插件市场索引。",
  },
  metadata: {
    categories: { productivity: { title: { en: "Productivity", zh: "效率" } } },
    labels: { skills: { title: { en: "Skills", zh: "技能" } } },
  },
  plugins: [
    {
      name: packageJson.name,
      title: { en: "Z-Library (zlib)", zh: "Z-Library（zlib）" },
      description: {
        en: packageJson.description,
        zh: "只包含技能：用 zlib CLI 搜索并下载 Z-Library 的书籍，并把本地书籍发送到 Kindle。",
      },
      author: "semantic-craft",
      homepage: packageJson.homepage,
      repository: { url: repoUrl },
      metadata: {
        category: "productivity",
        keywords: ["zlibrary", "z-library", "books", "ebook", "kindle", "zlib"],
        labels: ["skills"],
      },
      versions: [
        {
          version: packageJson.version,
          publishTimestamp: commitTimestamp,
          source: { type: "git", url: repoUrl, commit },
          engines: { dsh: packageJson.engines.dsh },
        },
      ],
    },
  ],
};

const serialized = `${JSON.stringify(index, null, 2)}\n`;
if (process.argv.includes("--print")) {
  process.stdout.write(serialized);
} else {
  mkdirSync(join(root, "market"), { recursive: true });
  writeFileSync(join(root, "market", "index.json"), serialized);
  console.log(`wrote market/index.json for ${packageJson.name}@${packageJson.version} at ${commit}`);
}
