# Upstream provenance and skill-text policy

The two bundled skills are **upstream text, reused verbatim**, with exactly the
adaptations recorded in this file. Nothing is reworded, added, or removed: when
upstream changes a sentence, `node scripts/sync-upstream.mjs` copies it
into `skills/` instead of anyone paraphrasing it locally. Only the outer
packaging (this repository's manifests, README, tests) is written here.

## Pin

| Field | Value |
| --- | --- |
| Repository | https://github.com/heartleo/zlib |
| Commit | 6a299fdc59927f7e84f94390c4e54bfaf4d06cee |
| Ref | main |
| Fetched at | 2026-10-18T03:00:34.426Z |
| License | MIT - upstream `LICENSE` reads "MIT License / Copyright (c) 2026 heartleo", and both upstream plugin manifests and both SKILL.md frontmatter declare `license: MIT` |
| Vendored snapshot | `upstream/heartleo-zlib-6a299fdc59927f7e84f94390c4e54bfaf4d06cee/` |
| Source record | `upstream/SOURCE.json` |

The vendored snapshot is byte-identical to
`https://raw.githubusercontent.com/heartleo/zlib/6a299fdc59927f7e84f94390c4e54bfaf4d06cee/<repo-relative path>`.
`upstream/SOURCE.json` records the sha256 and byte size of every file,
and `node scripts/sync-upstream.mjs --check` re-verifies them offline.
`README.md` and `.skillignore` are vendored for provenance
completeness; they are not loaded by the plugin at runtime.

## Vendored files

| Upstream repo-relative path | sha256 | Bytes |
| --- | --- | --- |
| `.agents/plugins/marketplace.json` | `5347673c6145df20a45f3fb71a0ae1fcb9def1779fe8508d6acbd4ac647d8806` | 351 |
| `.claude-plugin/marketplace.json` | `9a7fd3f465c2ea45c85414f5d62d822cf85a4e9fb05847b5fb9cce1e0035c88d` | 401 |
| `README.md` | `b11b07ba8e299443020460ed2c161f5380c8a2a35ee71f5dd84cb407ddf86c86` | 16003 |
| `plugins/zlib/.claude-plugin/plugin.json` | `6dd302014c4aeb4350e056d2a33b239eef2c9371b73eb72144e22ce196732a45` | 466 |
| `plugins/zlib/.codex-plugin/plugin.json` | `e303a40bb0269833d80f6605d93a7e63f9537a1821de9aaa12d5a7d3512236c0` | 1005 |
| `plugins/zlib/.skillignore` | `11fe17314a686a98a70f13e2ff79332e2a0ff78fc128245bcbc9035c59b22352` | 244 |
| `plugins/zlib/skills/kindle/SKILL.md` | `9c941579d392f288e3607017dfa7f16f2e00f953acc5aa80907d1adb916a45bb` | 5499 |
| `plugins/zlib/skills/zlib/SKILL.md` | `6e9a4a5c76b55e161882973787241f43de2b6489eec1210df4fae3f42a3ec9ef` | 13103 |

## Bundled skills

| Bundled path | Upstream source | Adaptations |
| --- | --- | --- |
| `skills/zlib/SKILL.md` | `plugins/zlib/skills/zlib/SKILL.md` | 3 (below) |
| `skills/kindle/SKILL.md` | `plugins/zlib/skills/kindle/SKILL.md` | none - byte-identical to upstream |

The YAML frontmatter (`name`, `description`, `license`)
is upstream verbatim, and the two hard rules stay present verbatim: the
"Golden rule: never run a bare interactive command" section and the
"Never run `zlib login` yourself" handoff (login happens in the user's
own terminal, the agent never runs it, and credentials are never passed as
flags).

## The complete adaptation list

These are the only differences between the vendored upstream text and
`skills/**/SKILL.md`. `node scripts/sync-upstream.mjs --check`
regenerates both bodies from the vendored snapshot by applying exactly these
rules, so any other edit fails the check (the diff must be exactly these hunks).

### 1. Flat skill names: `zlib:kindle` becomes `kindle`

Upstream is a Claude Code plugin, so it addresses its sibling skill by its
plugin-prefixed name `zlib:kindle` - including one leading-slash,
slash-command form. DSH registers skills flat, with no plugin namespace, so
neither form resolves here; the plain DSH skill name `kindle` is used.
Applies to `skills/zlib/SKILL.md` only (the upstream kindle skill
contains no such reference).

Deterministic rule: regular expression `/\/?zlib:kindle/g` replaced with
`kindle` - 3 matches. Exact anchors (upstream line numbers):

Upstream `plugins/zlib/skills/zlib/SKILL.md:35`:

```text
   **Never run `zlib login` yourself.** Its interactive prompts need a real terminal — inside this chat there is no TTY, so it cannot work here (same pattern as `gh auth login`: authentication happens in the user's own terminal, and the CLI persists the session to `~/.config/zlib/session.json` for later commands). Do not pass credentials as flags either — that leaks them into shell history. Your job is only the friendly nudge above. Reuse this same handoff whenever any command (search, history, profile, download) reports not-logged-in / session-expired mid-session — don't invent a new message each time. (An email/SMTP password exists too, but that belongs solely to the `zlib:kindle` skill — never bring it up around login.)
```

Bundled `skills/zlib/SKILL.md:35`:

```text
   **Never run `zlib login` yourself.** Its interactive prompts need a real terminal — inside this chat there is no TTY, so it cannot work here (same pattern as `gh auth login`: authentication happens in the user's own terminal, and the CLI persists the session to `~/.config/zlib/session.json` for later commands). Do not pass credentials as flags either — that leaks them into shell history. Your job is only the friendly nudge above. Reuse this same handoff whenever any command (search, history, profile, download) reports not-logged-in / session-expired mid-session — don't invent a new message each time. (An email/SMTP password exists too, but that belongs solely to the `kindle` skill — never bring it up around login.)
```

Upstream `plugins/zlib/skills/zlib/SKILL.md:146`:

```text
### Kindle delivery → the `/zlib:kindle` skill
```

Bundled `skills/zlib/SKILL.md:146`:

```text
### Kindle delivery → the `kindle` skill
```

Upstream `plugins/zlib/skills/zlib/SKILL.md:148`:

```text
Sending a downloaded file to Kindle (and the SMTP/Amazon setup it needs) lives in a separate skill, `zlib:kindle`. When the user wants a book on their Kindle, hand off to it rather than documenting SMTP here. `zlib download --send-to-kindle` also delivers in one step once Kindle is configured.
```

Bundled `skills/zlib/SKILL.md:148`:

```text
Sending a downloaded file to Kindle (and the SMTP/Amazon setup it needs) lives in a separate skill, `kindle`. When the user wants a book on their Kindle, hand off to it rather than documenting SMTP here. `zlib download --send-to-kindle` also delivers in one step once Kindle is configured.
```

### 2. Homebrew tap option removed

The binary-missing handoff must not steer the agent at
`brew install heartleo/tap/zlib`. That tap ships a formula named
`zlib` which shadows `homebrew/core/zlib` on machines that
also use Homebrew for other software (see the repository README), so the skill
must never instruct the agent to use it. The `go install` sentence is
left unchanged.

Deterministic rule: the regular expression below is replaced with the empty
string - 1 match. Exact anchor (upstream line 30):

```text
/ \(or `brew install heartleo\/tap\/zlib`\)/g
```

Upstream `plugins/zlib/skills/zlib/SKILL.md:30`:

```text
   > `zlib` is not on your PATH. Install it with `go install github.com/heartleo/zlib/cmd/zlib@latest` (or `brew install heartleo/tap/zlib`), then ask me again.
```

Bundled `skills/zlib/SKILL.md:30`:

```text
   > `zlib` is not on your PATH. Install it with `go install github.com/heartleo/zlib/cmd/zlib@latest`, then ask me again.
```

### 3. Appended "Blocked mirrors and DiamWall" section

The installed zlib CLI can meet a DiamWall-blocked mirror; upstream's README
documents that failure surface but its SKILL.md does not. This section uses only
commands upstream already documents (`zlib doctor --eapi --json`,
`ZLIB_DOMAIN`) and keeps signing in as the user's own step. Applies to
`skills/zlib/SKILL.md` only.

Placement: appended after upstream's last line
(`plugins/zlib/skills/zlib/SKILL.md:179`), with exactly one blank line
before the heading, and the file ends with one newline. Upstream's last line is:

```text
- Respect the user's daily download limit shown by `zlib profile`; don't loop downloads past it.
```

The appended bytes (verbatim; the first newline creates the blank line between
upstream's last line and the heading) are:

```text

## Blocked mirrors and DiamWall

Most current Z-Library web domains put automated requests behind DiamWall, so a mirror can answer with HTTP 307, 513 or 517, `Access Denied | DiamWall`, or a JS challenge instead of book data. Before blaming the query, run `zlib doctor --eapi --json` and pick a domain whose `status` is `healthy`, or `challenged` — a challenged domain is usable because the client solves its JS proof-of-work automatically. Domains reported `diamwall_blocked`, `http_error`, `redirect_loop`, or `network_error` are not usable. Have the user set `ZLIB_DOMAIN=https://<that domain>` in `~/.config/zlib/.env` (the network-error bullet above shows the file), then retry. Signing in is still the user's own step.
```

In the bundled file this is lines 180-183: line 180 blank, line 181
`## Blocked mirrors and DiamWall`, line 182 blank, line 183 the
paragraph above.

## Verification

```bash
# Offline: vendored sha256 + regenerated skill bodies. Exit 0 when clean.
node scripts/sync-upstream.mjs --check

# The vendored snapshot is byte-identical to the upstream raw files:
shasum -a 256 upstream/heartleo-zlib-6a299fdc59927f7e84f94390c4e54bfaf4d06cee/plugins/zlib/skills/zlib/SKILL.md
# 6e9a4a5c76b55e161882973787241f43de2b6489eec1210df4fae3f42a3ec9ef
shasum -a 256 upstream/heartleo-zlib-6a299fdc59927f7e84f94390c4e54bfaf4d06cee/plugins/zlib/skills/kindle/SKILL.md
# 9c941579d392f288e3607017dfa7f16f2e00f953acc5aa80907d1adb916a45bb

# Exactly the three adaptations, and nothing else:
diff -u upstream/heartleo-zlib-6a299fdc59927f7e84f94390c4e54bfaf4d06cee/plugins/zlib/skills/zlib/SKILL.md skills/zlib/SKILL.md
diff -u upstream/heartleo-zlib-6a299fdc59927f7e84f94390c4e54bfaf4d06cee/plugins/zlib/skills/kindle/SKILL.md skills/kindle/SKILL.md  # empty

# Both hard rules still present:
grep -n "Golden rule: never run a bare interactive command" skills/zlib/SKILL.md
grep -n "Never run .zlib login. yourself" skills/zlib/SKILL.md

# The project tests (plugin.test.js must stay green):
node --test
```

`node scripts/sync-upstream.mjs --check` prints, when clean:

```text
sync-upstream --check: heartleo/zlib@6a299fdc59927f7e84f94390c4e54bfaf4d06cee (ref main)
  check: clean (8 vendored file(s) match SOURCE.json; 2 bundled skill body/bodies regenerate from upstream)
  kindle: upstream verbatim
  zlib: 3x zlib:kindle -> kindle; 1x homebrew tap option removed; 1x appended section
```

## How to re-sync

1. Web/default mode (network): `node scripts/sync-upstream.mjs`
   fetches every file in `upstream/SOURCE.json` from
   `raw.githubusercontent.com` at the pinned commit, rewrites
   `upstream/heartleo-zlib-<commit>/` (pruning stale files and stale
   snapshot directories), refreshes sha256/byte counts, and regenerates
   `skills/**/SKILL.md` with the rules above. It prints the changed
   files and is a no-op when the pinned content has not moved
   (`fetchedAt` only advances when the content changes).
2. Offline check (CI): `node scripts/sync-upstream.mjs --check` - no
   network; exit 1 with a per-file report if vendored bytes disagree with
   `SOURCE.json` or a bundled body differs from upstream + adaptations.
3. To move the pin, edit `repository`/`commit`/`ref`
   in `upstream/SOURCE.json` (and the `files[]` path list if
   upstream moved files; plain string entries are accepted), then run the
   default mode and review the diff. If upstream reworded an anchor, the
   deterministic adaptation may stop matching: update the anchor and this file
   together, and never "fix" a bundled body by hand.
