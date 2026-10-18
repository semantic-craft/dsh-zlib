/**
 * dsh-zlib — a skills-only DeepSeek Harness plugin.
 *
 * It ships two agent skills and nothing else:
 *
 *   - `zlib`   — search and download books with the `zlib` CLI
 *   - `kindle` — deliver a local book file to a Kindle
 *
 * The plugin reads the SKILL.md files from its own `skills/` directory at mount
 * time and registers each one as an embedded runtime skill on `ctx.skills`, the
 * same way `dsh-skill` documents in-memory registration. No tools, services, or
 * client surface are added; the model-facing `skill` tool and its catalog do the
 * rest.
 *
 * The identical skill files are also discoverable through the filesystem
 * provider (see `scripts/install.sh`), so the plugin works either as a mounted
 * bundle or as plain skills dropped into a skill root.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Cordis plugin name. */
export const name = "dsh-zlib";

/** The skill registry this plugin contributes to. */
export const inject = ["skills"];

/** Default skill root: `skills/` next to this package. */
export const defaultSkillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

/** The harness skill-name contract: lowercase, digits, single hyphens. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Split a `---` fenced frontmatter block off a SKILL.md.
 * @param {string} raw - file contents.
 * @returns {{data: Record<string, string>, body: string}}
 */
export function parseSkillDocument(raw) {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("missing YAML frontmatter");
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) throw new Error("unterminated YAML frontmatter");
  const block = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n+/, "");
  const data = {};
  for (const line of block.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body };
}

/**
 * Load every `<skillsDir>/<skill>/SKILL.md` as a skill definition.
 * @param {string} [skillsDir] - root holding one directory per skill.
 * @returns {Array<{name: string, description: string, whenToUse?: string, content: string, path: string}>}
 */
export function loadSkills(skillsDir = defaultSkillsDir) {
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(skillsDir, entry.name, "SKILL.md");
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    const { data, body } = parseSkillDocument(readFileSync(path, "utf8"));
    if (data.name === undefined || data.description === undefined) {
      throw new Error(`${path}: frontmatter requires name and description`);
    }
    if (!SKILL_NAME.test(data.name)) throw new Error(`${path}: invalid skill name "${data.name}"`);
    if (body.trim() === "") throw new Error(`${path}: skill body is empty`);
    skills.push({
      name: data.name,
      description: data.description,
      ...(data.whenToUse === undefined ? {} : { whenToUse: data.whenToUse }),
      content: body.trim(),
      path,
    });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Mount the plugin: register each bundled skill on the skill registry.
 * @param {import("@deepseek-ai/cordis").Context} ctx - plugin context.
 * @param {{skillsDir?: string}} [config] - optional `skillsDir` override.
 */
export function apply(ctx, config = {}) {
  const skillsDir = config.skillsDir ?? defaultSkillsDir;
  const skills = loadSkills(skillsDir);
  if (skills.length === 0) {
    ctx.logger?.warn?.(`${name}: no skills found under ${skillsDir}`);
    return;
  }
  for (const skill of skills) {
    ctx.skills.register({
      name: skill.name,
      description: skill.description,
      // Required by SkillRegistration: the registry copies it onto the
      // candidate verbatim, so an embedded skill must label its own source.
      source: "runtime",
      ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
      content: skill.content,
    });
    ctx.logger?.debug?.(`${name}: registered skill "${skill.name}" from ${skill.path}`);
  }
}
