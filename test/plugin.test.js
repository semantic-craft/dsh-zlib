import assert from "node:assert/strict";
import { test } from "node:test";

import { apply, inject, loadSkills, name, parseSkillDocument } from "../src/plugin.js";

/** Minimal stand-in for the Cordis context the plugin is mounted with. */
function stubContext() {
	const registered = [];
	const warnings = [];
	return {
		registered,
		warnings,
		skills: {
			register(skill) {
				registered.push(skill);
				return () => {};
			},
		},
		logger: { warn: (message) => warnings.push(message), debug: () => {} },
	};
}

test("plugin declares the skill registry it contributes to", () => {
	assert.equal(name, "dsh-zlib");
	assert.deepEqual(inject, ["skills"]);
});

test("loadSkills returns both bundled skills, sorted, with usable bodies", () => {
	const skills = loadSkills();
	assert.deepEqual(
		skills.map((skill) => skill.name),
		["kindle", "zlib"],
	);
	for (const skill of skills) {
		assert.ok(skill.description.length > 20, `${skill.name} needs a real description`);
		assert.ok(skill.content.length > 200, `${skill.name} body looks truncated`);
		assert.ok(!skill.content.startsWith("---"), `${skill.name} body must not repeat frontmatter`);
	}
});

test("apply registers exactly the bundled skills on ctx.skills", () => {
	const ctx = stubContext();
	apply(ctx);
	assert.deepEqual(
		ctx.registered.map((skill) => skill.name),
		["kindle", "zlib"],
	);
	const zlib = ctx.registered.find((skill) => skill.name === "zlib");
	assert.match(zlib.content, /zlib search/);
	assert.equal(zlib.source, "runtime", "SkillRegistration requires an explicit source");
	assert.equal(zlib.invocation, undefined, "register() owns the default invocation policy");
	assert.equal(ctx.warnings.length, 0);
});

test("a missing skill root warns instead of throwing, and registers nothing", () => {
	const ctx = stubContext();
	apply(ctx, { skillsDir: "/nonexistent/dsh-zlib/skills" });
	assert.deepEqual(ctx.registered, []);
	assert.equal(ctx.warnings.length, 1);
	assert.match(ctx.warnings[0], /no skills found/);
});

test("loadSkills tolerates an absent root", () => {
	assert.deepEqual(loadSkills("/nonexistent/dsh-zlib/skills"), []);
});

test("parseSkillDocument splits fenced frontmatter from the body", () => {
	const { data, body } = parseSkillDocument("---\nname: demo\ndescription: A demo skill\n---\n\n# Demo\n");
	assert.equal(data.name, "demo");
	assert.equal(data.description, "A demo skill");
	assert.equal(body, "# Demo\n");
});

test("parseSkillDocument rejects a document without frontmatter", () => {
	assert.throws(() => parseSkillDocument("# No frontmatter\n"), /frontmatter/);
});
