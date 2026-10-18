# dsh-zlib-plugin

A **skills-only DeepSeek Harness bundle** that gives the agent two skills:

| Skill    | What it does |
| -------- | ------------ |
| `zlib`   | Search Z-Library by title/author, download by book ID, browse history, read the daily quota — all through the local `zlib` CLI. |
| `kindle` | Send an already-downloaded ebook file to a Kindle, including the one-time SMTP/Amazon setup. |

It is the DSH counterpart of the plugin that ships inside
[`heartleo/zlib`](https://github.com/heartleo/zlib) and is installed there with
`codex plugin add zlib@zlib`. The skill bodies are the upstream text (see
[Upstream fidelity](#upstream-fidelity)); only the outer packaging is DSH's own.

## Patch or rebuild? — decision record

This repository **patches the existing artifact; it does not rebuild it.** The
artifact it started from was a link-mounted, skills-only bundle with 7 passing
tests. The evidence for keeping it:

- The desktop profile already declares and selects it:
  ```json
  // ~/.dsh/profiles/desktop/package.json
  "dependencies": { "dsh-zlib-plugin": "link:/Users/xianweizhang/Projects/dsh-zlib" },
  "dsh": { "profile": { "bundles": [ /* … */ "dsh-zlib-plugin" ] } }
  ```
- It is actually mounted: this project's own session skill catalog lists
  `zlib` and `kindle`, which only happens when the bundle's entry module ran
  `ctx.skills.register` inside the live composition.
- Its shape already matches the host contract: `dsh.bundle.patch` inserts one
  row, that row imports this package, and `apply()` registers two skills on
  `ctx.skills`. `scripts/verify-host.mjs` re-checks both with the host's own
  `loadProfileDirectory` and `evaluatePluginCompatibility`.
- `node --test` was green, and the install path was the real one
  (`link:<absolute path>` through the profile's plugin manager).

What was genuinely wrong was additive, not structural, and each gap is now
closed:

| Gap found in the artifact | Fix |
| --- | --- |
| `dsh.harnessRange` was invented — no host reader consumes it, so compatibility was never declared or enforced | real `engines.dsh` + `engines.node`; verified accepted by the host and refused when unsatisfiable |
| Skill bodies were paraphrases of upstream, drifting on the two hard rules | upstream bodies reused verbatim, with three documented adaptations (below) and a `--check` sync test |
| No distributable form at all (only a local link) | `market/index.json` in plugin-market index format 1, validated with the host's `parseMarketIndex`, install target produced by `marketInstallTarget` as a commit-pinned git spec |
| Failure surfaces were undocumented and untested | skills cover them; `test/skill-contract.test.js` asserts the text; `test/host-contract.test.js` proves the host-side refusal |
| README claimed behaviors it never demonstrated | every claim here has a command in [Verification](#verification) |

Rebuilding would have replaced a working mount with an identical one and lost
the only recorded evidence that the composition works. A patch keeps the
installed link, the profile selection, and the tested entry-module contract
while fixing the packaging layer.

## Upstream fidelity

The source of truth is `heartleo/zlib` at the commit recorded in
[`upstream/SOURCE.json`](upstream/SOURCE.json) (fetch it with
`node scripts/sync-upstream.mjs`). The vendored snapshot under `upstream/` is
byte-identical to the raw files; `skills/*/SKILL.md` is that text plus exactly
three documented adaptations:

1. **Flat skill names.** Upstream lives in a plugin namespace and refers to the
   Kindle skill as `zlib:kindle`; DSH registers skills flat, so the reference
   becomes `kindle`.
2. **No Homebrew tap.** The upstream binary-missing handoff also suggests
   `brew install heartleo/tap/zlib`. That tap ships a formula *named* `zlib` and
   shadows `homebrew/core/zlib`, a compression library many other formulae
   depend on, so the suggestion is removed and only `go install` remains.
3. **DiamWall coverage.** A short closing section tells the agent to run
   `zlib doctor --eapi --json`, accept `healthy` or `challenged` domains,
   reject `diamwall_blocked`/`http_error`/`redirect_loop`/`network_error`,
   and hand the user a `ZLIB_DOMAIN` edit. It documents commands upstream
   already ships; it adds no capability.

Everything else — including the two hard rules — is upstream text:
**never run a bare interactive command**, and **login is handed off to the
user's own terminal, never run by the agent, credentials never passed as
flags**. `node scripts/sync-upstream.mjs --check` fails if the bodies drift.

## Requirements

The `zlib` CLI on `PATH`:

```bash
go install github.com/heartleo/zlib/cmd/zlib@latest   # Go 1.25+
ln -sf ~/go/bin/zlib ~/.local/bin/zlib                # if ~/go/bin is not on PATH
zlib version
```

> **Do not install it with `brew install heartleo/tap/zlib`.** That tap ships a
> formula named `zlib`; Homebrew warns that it **shadows `homebrew/core/zlib`**,
> the compression library many other formulae depend on. If it is already
> installed that way, `brew uninstall zlib` restores core formula resolution.
>
> This machine currently has that formula installed (`brew list --versions zlib`
> → `zlib 0.0.8`, with Homebrew's shadow warning). It is not the binary the
> skills use — `~/.local/bin/zlib` wins on `PATH` — and removing it does not
> touch the Go build. Whether to run `brew uninstall zlib` is the user's call;
> the plugin never does it.

Signing in is the user's job, in a real terminal:

```bash
zlib doctor --eapi            # pick a domain reported healthy or challenged
zlib login --eapi             # writes ~/.config/zlib/session.json
```

The plugin never runs `zlib login`. With no session, `zlib profile` prints
`Not logged in. Run: zlib login`; the skill stops and gives the user that
handoff instead of hanging.

## Install

On this machine the desktop profile installs the **published package** — the
dependency is `github:semantic-craft/dsh-zlib#<release-commit>`, the bundle is
selected, and the runtime copy lives under
`~/.dsh/profiles/desktop/node_modules/dsh-zlib-plugin`. Running the plugin needs
no checkout of this repository; the two modes below are for developing it or for
installing it elsewhere.

### Development — plugin manager `link:`

A live profile composes on configuration change, so the bundle mounts without a
restart. Install from the Web UI's Plugins page, or with the CLI equivalent that
the manager's operation uses:

```bash
dsh plugin --profile desktop add link:/Users/xianweizhang/Projects/dsh-zlib
```

The profile then contains `"dsh-zlib-plugin": "link:/Users/xianweizhang/Projects/dsh-zlib"`
and lists the bundle; the composition mounts `src/plugin.js`, which registers
both skills. To remove it:
`dsh plugin --profile desktop remove dsh-zlib-plugin`.

Note for development: the host keeps a package's module generation for the life
of the process, so an edited `src/plugin.js` is not re-imported by re-mounting
the same package — restart the host, or remount after editing only data files
(the skills are re-read on every `apply()`).

### Distribution — plugin market index

The published form is a [plugin market index format
1](https://github.com/deepseek-ai) document:

- Repository: <https://github.com/semantic-craft/dsh-zlib> (public)
- Index: <https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json>
- Install target: `git+https://github.com/semantic-craft/dsh-zlib.git#<40-hex-commit>`

Its single version is a **git source pinned to a 40-hex commit**, so an install
resolves to exactly that tree. `marketInstallTarget` produces the target; it is
the value `plugin_market` hands to `plugin_manager`'s `install_bundle` (or
`dsh plugin --profile <name> add <target>`). Register the index URL as a market
source (`indexes` in the `plugin-market` row's config) to make it installable
from Discover.

```bash
node scripts/finalize-market.mjs      # regenerate from package.json + git HEAD
node scripts/validate-market.mjs      # parseMarketIndex + marketInstallTarget
node scripts/validate-market.mjs --resolve   # pnpm resolves the pinned target
```

> **`pnpm view` and git targets.** `pnpm view` accepts only registry packages
> (`ERR_PNPM_INVALID_PACKAGE_NAME` for `git+https://…`), so it cannot print
> metadata for the commit-pinned target required here; that is a pnpm limitation
> for every non-registry spec, not a defect in the index. The equivalent
> pnpm-native proof is `validate-market.mjs --resolve`, which asks pnpm to
> resolve the exact target and asserts the pinned commit appears in the
> lockfile; `docs/market-distribution.md` shows the lockfile and the end-to-end
> install. Once the package is also published to a registry, an npm-source
> version (`name@version`) can be added to the same index and
> `pnpm view name@version` applies to that entry.

## Failure surfaces

The plugin is skills-only, so every failure is handled in the skill text the
agent reads; the tests assert the text is there and the host-side checks are real.

| Failure | Detection | Skill behavior | Agent waits? |
| --- | --- | --- | --- |
| `engines.dsh` not satisfied | host install check / bundle load | install refused before pnpm runs; startup skips the bundle and names `engines.dsh` | no — reported to user |
| `zlib` binary missing | preflight `command -v zlib` → `BIN_MISSING` | stop, give `go install` instructions (no Homebrew tap), wait | yes |
| `zlib` too old for `--json` | flag error / usage output | fall back to the static table forms; IDs come from the table's ID column | no |
| Mirror blocked by DiamWall | `zlib doctor --eapi --json` statuses, HTTP 307/513/517 | pick `healthy`/`challenged` domain, have user set `ZLIB_DOMAIN`, retry | yes (user edits env file) |
| Not logged in / session expired | `zlib profile` or any command prints `Not logged in` or `session expired` | friendly handoff: user runs `zlib login` in their own terminal | yes |
| EAPI session lapsed | `EAPI profile/history/search failed` or `Invalid credentials` (EAPI wording never says "Not logged in") | same login handoff; never runs login | yes |
| Mirror misconfigured | `Domain is not configured` / `Invalid Z-Library domain` | user sets `ZLIB_DOMAIN`; a suggested `zlib login --domain` is handed to the user, never run | yes |
| Release build ignores `ZLIB_DOWNLOAD_DIR` | `zlib download --help` shows only `--dir` (default `.`) | always pass `--dir`; trust only the `Saved to:` line; do not offer to make the variable permanent | no |
| Download hangs on an old build | shell-side timeout, missing `Saved to:` | stop, verify the target directory, suggest upgrade | no |

## Layout

```
package.json              dsh bundle manifest: dsh.manifestVersion, dsh.bundle.patch, engines.dsh
cordis.patch.yml          inserts exactly one row: this package's entry module
src/plugin.js             cordis plugin: loadSkills() + ctx.skills.register()
src/index.js              stable re-export of ./plugin.js
skills/zlib/SKILL.md      upstream skill text + documented adaptations
skills/kindle/SKILL.md
upstream/                 pinned snapshot of the upstream plugin files
market/index.json         plugin market index format 1, commit-pinned git target
scripts/sync-upstream.mjs regenerate/verify skills from the pinned upstream snapshot
scripts/finalize-market.mjs  regenerate market/index.json from package.json + git HEAD
scripts/validate-market.mjs  host validator + install target (+ pnpm resolution)
scripts/verify-host.mjs   host's own compatibility + bundle-loading checks
scripts/install.sh        manual profile manifest edit / skills symlinks
test/                     node --test: plugin, manifest, market, skill contract, host
```

## Verification

```bash
pnpm install                                 # dev dependencies, once (not needed at runtime)
node --test                                  # unit + contract + host tests
node scripts/sync-upstream.mjs --check       # skills equal upstream + adaptations
node scripts/validate-market.mjs             # parseMarketIndex accepts the index
node scripts/validate-market.mjs --resolve   # pnpm resolves the pinned target
node scripts/verify-host.mjs                 # host accepts, and refuses bad engines
```

The host-side tests run only on a machine with DeepSeek Harness installed; they
skip otherwise. Everything else is dependency-light (`node --test` plus the
published `@deepseek-ai/dsh-plugin-market-index` dev dependency).

Evidence behind the claims above, recorded as it was observed:

- [`docs/upstream.md`](docs/upstream.md) — pinned upstream commit, sha256 of
  every vendored file, and the exact anchor/replacement for each adaptation.
- [`docs/zlib-cli-facts.md`](docs/zlib-cli-facts.md) — zlib v0.0.8 behavior:
  logged-out exit codes and exact strings, `--json` support per subcommand,
  missing-binary detection, `zlib doctor` mirror statuses (DiamWall), the
  no-TTY guarantees, and the full failure-surface matrix.
- [`docs/codex-alignment.md`](docs/codex-alignment.md) — the same plugin
  installed on the Codex side with `codex plugin add zlib@zlib`, and the
  three-hunk diff between the two installs.
- [`docs/market-distribution.md`](docs/market-distribution.md) — the published
  index and target, the pnpm lockfile resolution, and installing that target
  into a profile with `dsh plugin add`.
- [`docs/live-round-trip.md`](docs/live-round-trip.md) — an authenticated search
  rendered as the skill's markdown table, then a download by ID with size,
  MIME type, sha256, and the quota moving 0 → 1 of 10.
- [`docs/domain-verification.md`](docs/domain-verification.md) — how to decide
  whether a Z-Library mirror is genuine, with the 2026-10-18 header/challenge
  fingerprints of `z-lib.gd`, `zlib.bz`, `z-library.sk` and the unconfirmed
  look-alike `z-library.bz`.

## Licensing and credits

The skill instructions are adapted from [`heartleo/zlib`](https://github.com/heartleo/zlib)
(MIT, © 2026 heartleo), which is also the CLI the skills drive. This package is
MIT licensed; see [LICENSE](LICENSE).

Z-Library distributes works that are frequently under copyright and is not an
authorized distributor for most of its catalogue. Download only what you are
entitled to obtain.
