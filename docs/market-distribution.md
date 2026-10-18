# Distributable form — market index and install evidence

This page records the distribution path and the commands that proved it on
2026-10-18, for the released version **1.1.1** (the audit follow-up release;
1.1.0 was the first published build). Nothing here is inferred.

## Published form

- Repository: <https://github.com/semantic-craft/dsh-zlib> (public, `main`)
- Release commit: `ef0ac7baa8b3f21cfd865c8c128946c2f629973d` (`1.1.1`)
- Index commit: `70b118d` (adds `market/index.json` pointing at the release)
- Index: <https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json>
  (plugin market index format 1)

`market/index.json` is generated from `package.json` + the release commit by
`scripts/finalize-market.mjs`, so its single version is a git source pinned to
that commit.

## Validation with the host's own rule set

```console
$ node scripts/validate-market.mjs
ok - parseMarketIndex accepted https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json
target - dsh-zlib-plugin@1.1.1: git+https://github.com/semantic-craft/dsh-zlib.git#ef0ac7baa8b3f21cfd865c8c128946c2f629973d

$ curl -sS -o /dev/null -w '%{http_code}\n' \
    https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json
200
```

The target is exactly what `marketInstallTarget(name, version)` returns; it is
the value `plugin_market` hands to `plugin_manager`'s `install_bundle`.

## pnpm resolves the pinned target

```console
$ pnpm add --lockfile-only 'git+https://github.com/semantic-craft/dsh-zlib.git#ef0ac7b...'
$ sed -n '/dsh-zlib-plugin/,+12p' pnpm-lock.yaml
      dsh-zlib-plugin:
        specifier: github:semantic-craft/dsh-zlib#ef0ac7baa8b3f21cfd865c8c128946c2f629973d
        version: https://codeload.github.com/semantic-craft/dsh-zlib/tar.gz/ef0ac7baa8b3f21cfd865c8c128946c2f629973d

  dsh-zlib-plugin@https://codeload.github.com/semantic-craft/dsh-zlib/tar.gz/ef0ac7ba...:
    resolution: {gitHosted: true, integrity: sha512-ElnjCkqzl0r4ONZVJB3tAV9PxYQtdtP28asc3JrQ8AXWHnmI9jz3h/jHOOqCM8LjV95Qt4u/33z2fUNt/aOyNw==, tarball: ...}
    version: 1.1.1
    engines: {dsh: '>=0.2.0-rc.2 <0.3.0', node: '>=20'}
```

The lockfile keeps the pinned commit's tarball, version `1.1.1`, and the same
`engines.dsh` the bundle declares. `node scripts/validate-market.mjs --resolve`
runs this check itself and asserts the commit appears in the lockfile.

> `pnpm view` cannot be used for this target. pnpm 12.6.0 accepts only registry
> packages and refuses a git spec outright:
>
> ```console
> $ pnpm view 'git+https://github.com/semantic-craft/dsh-zlib.git#ef0ac7b...' name version
> Error: ERR_PNPM_INVALID_PACKAGE_NAME
>   × Invalid package name: "git+https://github.com/semantic-craft/dsh-zlib.git#ef0ac7b...".
>     This command only supports registry packages.
> ```
>
> The same error appears for `github:`, `file:` and `link:` specs, while a
> registry name works (`pnpm view semver version` → 7.8.5), so this is pnpm's
> registry-only limitation for every non-registry spec, not a property of this
> index. `validate-market.mjs --resolve` is the pnpm-native equivalent: it asks
> pnpm itself to resolve the exact target and asserts the pinned commit in the
> resulting lockfile.

## Installing the target into a real DSH profile

```console
$ dsh plugin --profile zlib-market-test2 add \
    'git+https://github.com/semantic-craft/dsh-zlib.git#ef0ac7baa8b3f21cfd865c8c128946c2f629973d'
dependencies:
+ dsh-zlib-plugin 1.1.1
Done in 2.3s using pnpm v11.28.5
```

The profile records the pinned dependency and selects the bundle:

```json
"dependencies": { "dsh-zlib-plugin": "github:semantic-craft/dsh-zlib#ef0ac7baa8b3f21cfd865c8c128946c2f629973d" },
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-zlib-plugin"] } }
```

The host then loads that installed copy (asked through the host's own
`loadProfileDirectory`) and the entry module registers both skills:

```json
{
  "skipped": [],
  "zlibRow": [{ "id": "dsh-zlib", "name": "dsh-zlib-plugin" }],
  "installedVersion": "1.1.1",
  "registered": [
    { "name": "kindle", "source": "runtime", "chars": 5166 },
    { "name": "zlib", "source": "runtime", "chars": 14482 }
  ]
}
```

The installed `zlib` body contains the appended host notes
(`Blocked mirrors and DiamWall`, `Session and domain errors`,
`Download directory on release builds`), so the distributed copy — not just the
working tree — carries the failure coverage.

The throwaway profile was deleted after the check; the desktop profile keeps the
development `link:` install.

## Reproducing

```bash
node scripts/finalize-market.mjs    # after any release commit or repo URL change
node scripts/validate-market.mjs    # parseMarketIndex + marketInstallTarget
node scripts/validate-market.mjs --resolve   # pnpm resolves the pinned target
```

A new release means: commit the source, run `finalize-market.mjs` (it reads
`git rev-parse HEAD`), validate, and commit `market/index.json`. The pinned
commit is the release commit that precedes the index commit.
