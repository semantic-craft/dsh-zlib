# Distributable form — market index and install evidence

This page records the distribution path and the commands that proved it on
2026-10-18. Nothing here is inferred.

## Published form

- Repository: <https://github.com/semantic-craft/dsh-zlib> (public, `main`)
- Release commit: `8e5a440d82ba0cae8569f4075f99bb58b66d4784`
- Index: <https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json>
  (plugin market index format 1)

`market/index.json` was generated from `package.json` + the release commit by
`scripts/finalize-market.mjs`, so its single version is a git source pinned to
that commit.

## Validation with the host's own rule set

```console
$ node scripts/validate-market.mjs
ok - parseMarketIndex accepted https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json
target - dsh-zlib-plugin@1.1.0: git+https://github.com/semantic-craft/dsh-zlib.git#8e5a440d82ba0cae8569f4075f99bb58b66d4784

$ curl -sS -o /dev/null -w '%{http_code}\n' \
    https://raw.githubusercontent.com/semantic-craft/dsh-zlib/main/market/index.json
200
```

The target is exactly what `marketInstallTarget(name, version)` returns; it is
the value `plugin_market` hands to `plugin_manager`'s `install_bundle`.

## pnpm resolves the pinned target

```console
$ pnpm add --lockfile-only 'git+https://github.com/semantic-craft/dsh-zlib.git#8e5a440...'
$ sed -n '/dsh-zlib-plugin/,+12p' pnpm-lock.yaml
      dsh-zlib-plugin:
        specifier: github:semantic-craft/dsh-zlib#8e5a440d82ba0cae8569f4075f99bb58b66d4784
        version: https://codeload.github.com/semantic-craft/dsh-zlib/tar.gz/8e5a440d82ba0cae8569f4075f99bb58b66d4784

  dsh-zlib-plugin@https://codeload.github.com/semantic-craft/dsh-zlib/tar.gz/8e5a440...:
    resolution: {gitHosted: true, integrity: sha512-q9p4NY5fHH8n+k9iXbQDGS63TzqTgSh7/ipNCDKqu44XPa2WJBTSvBOK3YU0EgnneHizbCKqR/coRRmT0zP7nA==, tarball: ...}
    version: 1.1.0
    engines: {dsh: '>=0.2.0-rc.2 <0.3.0', node: '>=20'}
```

The lockfile keeps the pinned commit's tarball, version `1.1.0`, and the same
`engines.dsh` the bundle declares.

> `pnpm view` cannot be used for this target. pnpm 12.6.0 accepts only registry
> packages and refuses a git spec outright:
>
> ```console
> $ pnpm view 'git+https://github.com/semantic-craft/dsh-zlib.git#8e5a440...' name version
> Error: ERR_PNPM_INVALID_PACKAGE_NAME
>   × Invalid package name: "git+https://github.com/semantic-craft/dsh-zlib.git#8e5a440...".
>     This command only supports registry packages.
> ```
>
> This is a pnpm limitation for every non-registry spec, not a property of this
> index. `validate-market.mjs --resolve` is the pnpm-native equivalent: it asks
> pnpm itself to resolve the exact target and asserts the pinned commit in the
> resulting lockfile.

## Installing the target into a real DSH profile

```console
$ dsh plugin --profile zlib-market-test add \
    'git+https://github.com/semantic-craft/dsh-zlib.git#8e5a440d82ba0cae8569f4075f99bb58b66d4784'
dependencies:
+ dsh-zlib-plugin 1.1.0
Done in 2.3s using pnpm v11.28.5
```

The profile records the pinned dependency and selects the bundle:

```json
"dependencies": { "dsh-zlib-plugin": "github:semantic-craft/dsh-zlib#8e5a440d82ba0cae8569f4075f99bb58b66d4784" },
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-zlib-plugin"] } }
```

The host then loads that installed copy (asked through the host's own
`loadProfileDirectory`) and the entry module registers both skills:

```json
{
  "skipped": [],
  "zlibRow": [{ "id": "dsh-zlib", "name": "dsh-zlib-plugin" }],
  "installedVersion": "1.1.0",
  "registered": [
    { "name": "kindle", "source": "runtime", "chars": 5166 },
    { "name": "zlib", "source": "runtime", "chars": 13346 }
  ]
}
```

## Reproducing

```bash
node scripts/finalize-market.mjs    # after any release commit or repo URL change
node scripts/validate-market.mjs    # parseMarketIndex + marketInstallTarget
node scripts/validate-market.mjs --resolve   # pnpm resolves the pinned target
```

A new release means: commit the source, run `finalize-market.mjs` (it reads
`git rev-parse HEAD`), validate, and commit `market/index.json`. The pinned
commit is the release commit that precedes the index commit.
