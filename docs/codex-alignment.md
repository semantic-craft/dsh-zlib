# Alignment with the Codex/Claude Code plugin

The DSH bundle is meant to be the same product as `codex plugin add zlib@zlib`.
This page records what was installed on both harnesses on the same machine and
what differs.

## Codex side (the reference behavior)

```console
$ codex plugin marketplace add heartleo/zlib --ref main --json
{
  "marketplaceName": "zlib",
  "installedRoot": "/Users/xianweizhang/.codex/.tmp/marketplaces/zlib",
  "alreadyAdded": false
}

$ codex plugin add zlib@zlib --json
{
  "pluginId": "zlib@zlib",
  "name": "zlib",
  "marketplaceName": "zlib",
  "version": "0.1.0",
  "installedPath": "/Users/xianweizhang/.codex/plugins/cache/zlib/zlib/0.1.0",
  "authPolicy": "ON_INSTALL"
}

$ codex plugin list
...
zlib@zlib  installed, enabled  0.1.0  .../.tmp/marketplaces/zlib/plugins/zlib
```

`~/.codex/config.toml` records the selection:

```toml
[plugins."zlib@zlib"]
enabled = true
```

The installed cache holds exactly the upstream plugin payload: the two
`SKILL.md` files, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
and `.skillignore`.

## DSH side (this repository)

```console
$ dsh plugin --profile desktop add link:/Users/xianweizhang/Projects/_forks/dsh-zlib
✓ Lockfile passes supply-chain policies (verified 6s ago)
[WARN] Issues with peer dependencies found. Run "pnpm peers check" to list them.
Done in 415ms using pnpm v11.28.5
```

The link was already installed, so this run is idempotent. A throwaway profile
showed the fresh-install form of the same operation:

```console
$ dsh plugin --profile zlib-selftest add link:/Users/xianweizhang/Projects/_forks/dsh-zlib
dependencies:
+ dsh-zlib-plugin 1.1.0 <- ../../../Projects/_forks/dsh-zlib
Done in 203ms using pnpm v11.28.5
```

`~/.dsh/profiles/desktop/package.json` records it:

```json
"dependencies": { "dsh-zlib-plugin": "link:/Users/xianweizhang/Projects/_forks/dsh-zlib" },
"dsh": { "profile": { "bundles": [ "...", "dsh-zlib-plugin" ] } }
```

and the composition mounts `src/plugin.js`, whose only effect is
`ctx.skills.register()` for `zlib` and `kindle`.

## What maps to what

| Codex / Claude Code | DSH | Notes |
| --- | --- | --- |
| marketplace `.agents/plugins/marketplace.json` | `market/index.json` (plugin market index format 1) | Codex installs from a marketplace source; DSH validates the index with `parseMarketIndex` and installs the entry's `marketInstallTarget` |
| `codex plugin add zlib@zlib` | `plugin_manager` `install_bundle` (or `dsh plugin --profile <name> add <target>` / `link:<abs path>` in development) | both store the selection in the profile config; DSH additionally enforces `engines.dsh` before pnpm runs |
| `.codex-plugin/plugin.json` | `package.json` with `dsh.bundle.patch` + `engines.dsh` | Codex's `skills: "./skills/"` becomes the bundle's entry module registering the same directory |
| `.claude-plugin/plugin.json` | — | Claude Code's identity file has no DSH reader |
| `.skillignore` | — | the DSH bundle ships an explicit `skills/` list, so no install-time scanner exclusions |
| plugin version `0.1.0` (upstream plugin.json) | package version `1.1.1` | DSH's version is the packaging version; `market/index.json` pins it to a git commit |

## Skill text parity

Comparing the Codex-installed cache against this bundle:

```console
$ diff -u ~/.codex/plugins/cache/zlib/zlib/0.1.0/skills/kindle/SKILL.md skills/kindle/SKILL.md
$    # no output: byte-identical

$ diff -u ~/.codex/plugins/cache/zlib/zlib/0.1.0/skills/zlib/SKILL.md skills/zlib/SKILL.md
# exactly three hunks:
#  1. the Homebrew-tap parenthetical removed from the BIN_MISSING handoff
#  2. zlib:kindle / /zlib:kindle -> kindle (flat DSH skill names)
#  3. the appended "Blocked mirrors and DiamWall" section
```

Those are the same three adaptations recorded in
[`upstream.md`](upstream.md) and enforced by
`node scripts/sync-upstream.mjs --check`.

## Behavioral parity that matters

- Same two skills, same trigger descriptions, same commands: `zlib search
  --json --count 10`, `zlib download <id>`, `zlib profile`, `zlib history
  --json`, `zlib kindle send <file>`.
- Same hard rules in both harnesses: never run a bare interactive form, and
  never run `zlib login`; the user signs in from their own terminal.
- Same failure handling: missing binary, old binary without `--json`, blocked
  mirror (DiamWall), and logged-out session each stop and hand off instead of
  hanging.
- Neither install adds an MCP server, a slash command, or any new CLI verb; the
  payload is instruction text only in both harnesses.
