# zlib CLI v0.0.8 — verified behaviour and failure surfaces

Probe date: **2026-10-18 ~11:00 Asia/Shanghai** on the machine that runs this DSH session.

| Fact | Value |
| --- | --- |
| CLI | `zlib version v0.0.8` (`zlib version`, `zlib --version`, `zlib -v` all identical) |
| Build | `go version -m`: `go1.27.1`, module `github.com/heartleo/zlib v0.0.8 h1:G3DM2LS3RCufLBV5GQofsP6aHzAf66HF7CuP00PZ3b0=` |
| Entry on PATH | `/Users/xianweizhang/.local/bin/zlib` → symlink → `/Users/xianweizhang/go/bin/zlib` (16,523,026 bytes) |
| Other `zlib` on PATH | `/opt/homebrew/bin/zlib` → `../Cellar/zlib/0.0.8/bin/zlib` (tap `heartleo/tap/zlib`, Go 1.25.0, `v0.0.8+dirty`) — **not selected**, `~/.local/bin` comes first |
| Auth state | **Not logged in**; `~/.config/zlib/` did not exist at probe time |
| DSH host | `dsh --version` → `0.2.1-rc.2` (Electron 44.7.0, bundled Node 24.21.0) |
| Shell | DSH `bash` tool, **no TTY** (`[ -t 0 ]` and `[ -t 1 ]` both false) |

Method / hygiene:

* No `zlib login` was ever run in any form and no credentials were supplied.
* No bare interactive form (`zlib search` without a query, `zlib history` without flags, `zlib kindle` without a file) was run.
* Every network command was bounded with the bash tool's `timeoutMs`; macOS has no `timeout` binary (`command -v timeout` → exit 1; invoking it → `bash: timeout: command not found`, exit 127).
* The only post-login code paths probed used a **synthetic session in an isolated `HOME=/tmp/zlib-probe-home-*`** containing placeholder cookies (e.g. `{"cookies":{"a":"b"},"domain":"https://z-lib.gd"}`) plus, for EAPI mode, fake remix keys. This is not a login and never touched the real config. Everything that needed that synthetic session is labelled **[synthetic session]**; anything only read from the binary or its matching source is labelled **[source-only]**.
* The v0.0.8 source in `~/go/pkg/mod/github.com/heartleo/zlib@v0.0.8/` is the module recorded in the binary's build info, so it is treated as the exact source of the shipped binary. The main-branch snapshot `~/go/pkg/mod/github.com/heartleo/zlib@v0.0.9-0.20260907080718-6a299fdc5992/` is the commit vendored in `upstream/`.

---

## 1. Version and PATH resolution

```console
$ zlib version
zlib version v0.0.8                       # exit 0
$ zlib --version
zlib version v0.0.8                       # exit 0
$ zlib -v
zlib version v0.0.8                       # exit 0
$ command -v zlib
/Users/xianweizhang/.local/bin/zlib       # exit 0
$ ls -l ~/.local/bin/zlib ~/go/bin/zlib
lrwxr-xr-x  /Users/xianweizhang/.local/bin/zlib -> /Users/xianweizhang/go/bin/zlib
-rwxr-xr-x  /Users/xianweizhang/go/bin/zlib   (16523026 bytes)
```

`type -a zlib` lists **three** candidates in PATH order:

1. `/Users/xianweizhang/.local/bin/zlib` (first; `~/.local/bin` appears twice in PATH)
2. `/Users/xianweizhang/.local/bin/zlib` (duplicate PATH entry)
3. `/opt/homebrew/bin/zlib` → `../Cellar/zlib/0.0.8/bin/zlib` (Homebrew tap `heartleo/tap/zlib`; installed)

`brew info zlib` on this machine:

```console
==> zlib: stable 0.0.8
Warning: `zlib` shadows `homebrew/core/zlib`.
...
==> Caveats
The following zlib executables are shadowed by commands in /Users/xianweizhang/.local/bin:
zlib
Running these by name will not invoke the version provided by Homebrew
because the shadowing commands come earlier in your PATH.
```

So `command -v zlib` is correct but does not prove *which* zlib — the DSH skill's no-Homebrew-tap adaptation is well founded on this machine.

## 2. Logged-out behaviour

Real `HOME`, no `~/.config/zlib/`. All commands below were run once each.

| Command | stdout | stderr (exact) | exit |
| --- | --- | --- | --- |
| `zlib profile` | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib profile --json` | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib search "dune" --json --count 3` | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib history --json` | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib download Gz31nyAV5E --dir /tmp/zlib-probe` | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib search "dune" --count 3` (fallback form, no `--json`) | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib history --page 1` (fallback form) | *(empty)* | `Not logged in. Run: zlib login` | 1 |
| `zlib download` (no args) | *(empty)* | `✗ Error: accepts 1 arg(s), received 0` | 1 |
| `zlib doctor --json` | JSON array, see §5 | *(empty)* | **0** |
| `zlib doctor --eapi --json` | JSON array, see §5 | *(empty)* | **0** |
| `zlib logout` **[synthetic HOME]** | `✓ Logged out.` | *(empty)* | 0 |

Notes:

* The exact string is `Not logged in. Run: zlib login` — no trailing period, **on stderr**, exit **1**. It is emitted by `newClient()` before any TTY handling or network request (`internal/cli/root.go:48-53`), which is why even a bare form would exit rather than hang while logged out.
* `/tmp/zlib-probe` was **not created** by the failed download.
* `zlib logout` does not need a session and exits 0 (`✓ Logged out.` from `colorFaint(symbolSuccess)`).
* Login state is a **local** check: `newClient()` only requires `~/.config/zlib/session.json` with a non-empty `cookies` map. With a synthetic session file, `zlib search "dune" --json --count 3` returned real JSON even though the cookies are worthless (search is public). Therefore preflight must keep using `zlib profile` as the login probe; "search worked" is not evidence of a valid session.
* A malformed `session.json`, `{}`, or `{"cookies":{}}` all fall through to the same `Not logged in. Run: zlib login` (verified with synthetic HOME).

### 2b. Adjacent configuration failures (deterministic, synthetic HOME)

| Case | stderr (exact) | exit |
| --- | --- | --- |
| session with cookies but empty domain | `Domain is not configured. Set ZLIB_DOMAIN or run zlib login --domain URL again.` | 1 |
| `ZLIB_DOMAIN=not-a-url` | `Invalid Z-Library domain: domain must be an HTTPS origin` | 1 |
| session domain `https://example.com` | `Invalid Z-Library domain: domain "example.com" is not in the allowed Z-Library suffix list` | 1 |
| `ZLIB_DOMAIN` unset + session with valid cookies | same "Domain is not configured" line | 1 |

These are configuration errors, not network errors, and they happen before any request. The same remediation applies: set `ZLIB_DOMAIN` to a doctor-approved mirror in `~/.config/zlib/.env` (or re-login with `--domain`).

## 3. `--json` support and the older-binary fallback

`zlib <cmd> --help` in v0.0.8:

| Command | `--json`? | Help line (exact) |
| --- | --- | --- |
| `search` | **yes** | `--json   Output results as JSON (requires a query)` |
| `history` | **yes** | `--json   Output history as JSON (implies non-interactive)` |
| `profile` | **yes** | `--json   Output limits as JSON` |
| `doctor` | **yes** | `--json   Output domain checks as JSON` |
| `download` | **NO** | flags are only `-d, --dir` and `--send-to-kindle` |

Live `--json` evidence **[synthetic session]**, HTML mode, `--count 3`:

```console
$ zlib search "dune" --json --count 3
{"books":[{"id":"Krogw359re","isbn":"9780593099322","url":"https://z-lib.gd/book/Krogw359re/dune.html","cover":"...","name":"Dune","authors":["Frank Herbert"],"publisher":"Penguin","year":"2019","language":"English","extension":"epub","size":"1.85 MB","rating":"5.0","quality":"5"}, ...],"page":1,"total_pages":3}
$ echo $?
0
```

* Top-level keys: `books`, `page`, `total_pages` (matches `SearchResult` in `model.go`).
* Each book: `id` is the alphanumeric book URL id (`Krogw359re`) that `zlib download` accepts; other keys observed: `isbn`, `url`, `cover`, `name`, `authors`, `publisher`, `year`, `language`, `extension`, `size`, `rating`, `quality`; `hash`/`download_url` appear only when the client has them (EAPI mode model).
* `history --json` (source `model.go`): `{"items":[…],"page":n,"total_pages":n}`, items with `id`, `name`, `url`, `extension`, `size`, `date` (plus `hash`/`download_url` when known).
* `profile --json` (source `model.go`): `{"daily_amount":n,"daily_allowed":n,"daily_remaining":n,"daily_reset":"…"}`.
* `doctor --json`: array of `{"domain","status","http_status"?,"final_url"?,"detail"?}`.

### Older binary without `--json`

An old binary treats `--json` as an unknown flag. Exact observed form in v0.0.8 (reproduced with `download`, which genuinely has no `--json`, and with a misspelled flag on every JSON command):

```console
$ zlib download Gz31nyAV5E --json --dir /tmp/zlib-probe
✗ Error: unknown flag: --json          # stderr, exit 1
$ zlib search "dune" --jsonx
✗ Error: unknown flag: --jsonx         # stderr, exit 1
$ zlib profile --jsonx
✗ Error: unknown flag: --jsonx         # stderr, exit 1
$ zlib history --jsonx
✗ Error: unknown flag: --jsonx         # stderr, exit 1
```

* `rootCmd` sets `SilenceUsage: true` and `SilenceErrors: true`, so the output is exactly one `✗ Error: unknown flag: --json` line on **stderr**; no usage block is printed. Exit **1**.
* The skill says "`--json` is **not recognized** (older binary)" — the CLI's literal wording is **`unknown flag: --json`**. A test must map the two phrases; the skill does not contain `unknown flag`.

### Fallback non-interactive forms (verified)

* `zlib search "<query>"` with no `--json` is already static: `search.go` only enters the interactive browser when `len(args)==0`. **[synthetic session]** produced the plain table, exit 0, zero ANSI escape bytes:

```console
$ zlib search "dune" --count 3
✓ Found 3 results · Page 1 / 3

╭───┬────────────┬───────┬───────────────┬──────┬────────┬─────────┬────────╮
│ # │ ID         │ Title │ Authors       │ Year │ Format │ Size    │ Rating │
├───┼────────────┼───────┼───────────────┼──────┼────────┼─────────┼────────┤
│ 1 │ Krogw359re │ Dune  │ Frank Herbert │ 2019 │ EPUB   │ 1.85 MB │ 5.0    │
│ 2 │ EGPbaYB5Ae │ Dune  │ Frank Herbert │ 1999 │ EPUB   │ 731 KB  │ 5.0    │
│ 3 │ 6PyxGx0eAg │ Dune  │ Frank Herbert │ 2015 │ EPUB   │ 776 KB  │ 5.0    │
╰───┴────────────┴───────┴───────────────┴──────┴────────┴─────────┴────────╯
```

* `zlib history --page 1` (or `--format …`) selects the static path: `history.go` enters the interactive browser only when `--page` was not changed, `--format` is empty **and** `--json` is false. Logged out it printed the not-logged-in line and exited 1 without hanging (verified); the table itself needs a session.
* `zlib search --json` with **no query** is rejected *before* the interactive prompt: `--json requires a search query (interactive mode has no JSON output)` (`search.go:22-25`, **[source-only]**, deliberately not run because it is the forbidden bare form). Logged out it never reaches that line: `newClient()` exits first.
* `zlib search "" --json` **[synthetic session]** → `✗ Error: zlibrary: search query is empty`, exit 1.
* `zlib download ""` **[synthetic session]** → `✗ Error: failed to fetch book: zlibrary: no book ID provided`, exit 1.

## 4. Missing binary

```console
$ ls -l /usr/bin/zlib /bin/zlib
ls: /usr/bin/zlib: No such file or directory
ls: /bin/zlib: No such file or directory          # exit 1
$ env PATH=/usr/bin:/bin sh -c 'command -v zlib'
                                                  # no output, exit 1
$ env PATH=/usr/bin:/bin sh -c 'command -v zlib >/dev/null 2>&1 && echo BIN_OK || echo BIN_MISSING'
BIN_MISSING                                       # exit 0 (the probe itself)
$ env PATH=/usr/bin:/bin bash -c 'zlib version'
bash: zlib: command not found                     # exit 127
```

So the skill's POSIX preflight is correct: `command -v zlib >/dev/null 2>&1` prints `BIN_MISSING`; a direct invocation fails with `command not found` / exit 127. The PowerShell branch (`Get-Command zlib -ErrorAction SilentlyContinue`) was not exercised (macOS host).

## 5. Mirror / DiamWall state and remediation

### 5a. `zlib doctor` needs no login and exits 0 regardless of health

Both commands completed without a session. **Exit code is 0 even when every domain is unusable** (proven with an unreachable proxy, see 5c), so the exit status must never be used as a health signal — parse the JSON `status` values.

`zlib doctor --json` (home page probe, v0.0.8, 2026-10-18):

| Domain | status | HTTP | detail (trimmed) |
| --- | --- | --- | --- |
| https://1lib.sk | `diamwall_blocked` | 513 | DiamWall anti-bot response |
| https://article.sk | `network_error` | — | TLS: certificate has expired |
| https://articles.sk | `network_error` | — | TLS: certificate has expired |
| https://z-lib.fm | `diamwall_blocked` | 513 | DiamWall anti-bot response |
| https://z-lib.gd | `challenged` | 503 | JS challenge; the client solves this automatically |
| https://z-lib.gl | `challenged` | 503 | JS challenge; the client solves this automatically |
| https://z-lib.sk | `diamwall_blocked` | 513 | DiamWall anti-bot response |
| https://z-library.ec | `http_error` | 403 | HTTP 403 |
| https://zlib.bz | `challenged` | 503 | JS challenge; the client solves this automatically |
| https://zliba.ru | `challenged` | 503 | JS challenge (final URL https://z-lib.by/) |

`zlib doctor --eapi --json` (EAPI probe, same run):

| Domain | status | HTTP | detail (trimmed) |
| --- | --- | --- | --- |
| https://1lib.sk | `diamwall_blocked` | 307 | DiamWall anti-bot redirect that never resolves |
| https://article.sk | `network_error` | — | TLS: certificate has expired |
| https://articles.sk | `network_error` | — | TLS: certificate has expired |
| https://z-lib.fm | `diamwall_blocked` | 307 | DiamWall anti-bot redirect that never resolves |
| https://z-lib.gd | **`healthy`** | 200 | — |
| https://z-lib.gl | **`healthy`** | 200 | — |
| https://z-lib.sk | `diamwall_blocked` | 307 | DiamWall anti-bot redirect that never resolves |
| https://z-library.ec | **`healthy`** | 200 | — |
| https://zlib.bz | **`healthy`** | 200 | — |
| https://zliba.ru | **`healthy`** | 200 | — |

Interpretation (matches `domain_probe.go` and the upstream README): `healthy` and `challenged` are **usable**; `diamwall_blocked`, `http_error`, `redirect_loop`, `network_error` are **not**. The two probes can disagree per domain (this run: z-lib.gd/gl/zlib.bz/zliba.ru show `challenged` on the home page but `healthy` on EAPI; z-library.ec shows `http_error 403` on the home page but `healthy` on EAPI), so **use `--eapi` for remediation** and never conclude "all blocked" from the home-page probe alone.

Observed status vocabulary: `healthy`, `challenged`, `diamwall_blocked`, `redirect_loop`, `http_error`, `network_error`, `invalid_domain` (last from `domain_probe.go`, not hit in this run).

### 5b. Remediation documented upstream

`/tmp/upstream/README.md` (commit 6a299fd; vendored at `upstream/heartleo-zlib-6a299fdc…/README.md`):

* lines 94-125 ("Set `ZLIB_DOMAIN` first" / Quick Start): every command resolves the mirror from `ZLIB_DOMAIN` first; probe with `zlib doctor --eapi`, set `ZLIB_DOMAIN` to a `healthy` or `challenged` domain, then `zlib login --eapi`. A successful login records the domain in `~/.config/zlib/.env`; a real environment variable and a working-directory `.env` both outrank that file. Only `diamwall_blocked`, `http_error`, `redirect_loop`, `network_error` are unusable.
* lines 265-285 ("Troubleshooting DiamWall (issue #16)"): run **both** `zlib doctor --json` and `zlib doctor --eapi --json`; set `ZLIB_DOMAIN` to a `healthy`/`challenged` domain and log in with EAPI; if a proxy is required, `zlib doctor --eapi --proxy <url>` then `ZLIB_PROXY`.

DSH adaptation: **login remains the user's step** — the agent may run doctor, may prepare/show `~/.config/zlib/.env` (0600, never overwrite existing contents), and must hand the user the `zlib login` step in their own terminal. The skill's current "Blocked mirrors and DiamWall" section says exactly this.

### 5c. Doctor error surfaces (deterministic)

```console
$ zlib doctor --eapi --json --proxy http://127.0.0.1:9
[{"domain":"https://1lib.sk","status":"network_error",...,"detail":"... proxyconnect tcp: dial tcp 127.0.0.1:9: connect: connection refused"}]
# exit 0 even though all 10 statuses are network_error
$ zlib doctor --proxy foo
✗ Error: invalid proxy URL                  # stderr, exit 1
$ zlib doctor --proxy ftp://127.0.0.1:9
✗ Error: unsupported proxy scheme "ftp"     # stderr, exit 1
```

## 6. Non-interactive guarantees (no TTY)

* `internal/cli/tty.go` (`isInteractive()`) requires **both stdin and stdout** to be terminals. In the DSH shell both are pipes (verified), so `download`, the `download`-path of `history --download`, and `search`'s download path all take the plain-text branch instead of bubbletea.
* Plain download output **[source-only]**, `internal/cli/download.go:` `runPlain()` prints `  Downloading: <book name>`, then `runDownload()` prints a blank line followed by `✓ Saved to: <path> (<n> bytes)` where `<path>` is `tildePath()`-shortened (home → `~`) and `✓` is `symbolSuccess`. Colour is stripped without a TTY: the observed error lines and the plain doctor/search tables contain **zero ANSI escape bytes** (`LC_ALL=C grep -c $'\033'` → 0), so the saved line will not carry colour codes.
* **Not observed live**: a successful download needs a real logged-in session; `zlib download` exits at `Not logged in` before fetching. **Do not** assert the `Saved to:` line from a logged-out run — it cannot be produced. Assert the skill text and the source-backed format; test the actual line only on a machine with a real session.
* A synthetic session reached the post-login download path but failed at book fetch, so no `Downloading:`/`Saved to:` line was emitted. The observed errors were:
  * `✗ Error: failed to fetch book: zlibrary: failed to parse page: requested /book/Gz31nyAV5E but received /` (synthetic cookies redirected to `/`)
  * `✗ Error: failed to fetch book: zlibrary: no book ID provided` (empty id)
* Old builds (before the no-TTY plain path) render an interactive progress display and can hang; that compatibility note stays in the skill and cannot be exercised on v0.0.8, which does have the plain path.

### Session-expired evidence (live, synthetic session)

Real `~/.config/zlib` untouched; test hive `HOME=/tmp/zlib-probe-home-expired` with `{"cookies":{"remix_userid":"1","remix_userkey":"deadbeef…"},"domain":"https://z-lib.gd"}`.

| Command | stderr (exact) | exit |
| --- | --- | --- |
| `zlib profile` | ``✗ Error: zlibrary: session expired, run `zlib login` to re-authenticate`` | 1 |
| `zlib history --json` | same line | 1 |
| `zlib search "dune" --json --count 3` | **succeeded** (public search; expiry does not block search) | 0 |
| `zlib download Gz31nyAV5E --dir /tmp/zlib-probe` | `✗ Error: failed to fetch book: zlibrary: failed to parse page: requested /book/Gz31nyAV5E but received /` (synthetic-cookie redirect, not the genuine expiry path) | 1 |
| EAPI-mode session, `zlib profile --json` | `✗ Error: zlibrary: EAPI profile failed: Invalid credentials` | 1 |

Source-exact expectations for a genuine expiry: HTML mode returns `ErrSessionExpired` from `client.go:490-494` (`id="loginForm"` page detection); the CLI prints ``✗ Error: zlibrary: session expired, run `zlib login` to re-authenticate``. Commands that wrap it print a prefix: `download` → `failed to fetch book: …`; `history --download` → `failed to load history page N: …`. EAPI mode never emits `session expired`: the server's envelope error is surfaced as `zlibrary: EAPI profile failed: <error>` / `EAPI history failed: <error>` / `EAPI search failed: <error>` (`eapi_profile.go`, `eapi.go`), e.g. `Invalid credentials`.

## 7. Failure-surface matrix

Rows requested by the task. "Wait" means the agent must hand off and wait for the user.

| Failure | Detection command | Observed signal | Required skill response | Wait? |
| --- | --- | --- | --- | --- |
| **Binary missing** | POSIX: `command -v zlib >/dev/null 2>&1 && echo BIN_OK \|\| echo BIN_MISSING`; PowerShell: `Get-Command zlib …` | `BIN_MISSING` from the probe; direct run: `bash: zlib: command not found`, exit **127** | **Handoff text** — stop, tell the user to install (`go install github.com/heartleo/zlib/cmd/zlib@latest`, Go 1.25+; no Homebrew tap), then wait | **yes** |
| **`engines.dsh` unsatisfied (host-side, not zlib)** | Host evaluates the manifest before importing it. Inspect `package.json` `engines.dsh` vs `dsh --version` (here `0.2.1-rc.2`); live proof: `node scripts/verify-host.mjs` / `test/host-contract.test.js` | Host functions: `evaluatePluginCompatibility()` → `{"engines.dsh":">=99.0.0"}`; `loadProfileDirectory()` `skippedBundles:[{"packageName":"dsh-zlib-plugin","reason":"Error: Plugin dsh-zlib-plugin@1.1.0 is incompatible with dsh 0.2.1-rc.2: requirements {"engines.dsh":">=99.0.0"}. Running it may cause crashes or data loss. Update the plugin or install a plugin version compatible with this dsh runtime. To accept this risk explicitly, grant the exact-version exemption for dsh-zlib-plugin@1.1.0 on dsh 0.2.1-rc.2 with dsh plugin allow-version or the plugin manager, then retry the installation or restart dsh. Exact-version exemption: not active."}]`. The bundle row is skipped → entry module never runs → **`zlib`/`kindle` are absent from the skill catalog**. No zlib CLI output exists | **Stop** — this cannot be handled by `SKILL.md` (it never loads). Report the version mismatch; user must install a compatible plugin/DSH or grant an exact-version exemption (`dsh plugin allow-version` per the host warning) and restart | **yes** (host/user action) |
| **zlib version without `--json`** | `zlib search "<q>" --json --count 10` / `zlib history --json`; help flags | stderr `✗ Error: unknown flag: --json`, exit **1**, no usage block (reproduced on v0.0.8 via `download --json`; same Cobra path for old binaries) | **Fallback command** — drop `--json`; `zlib search "<q>"` (query alone forces the static table) or `zlib history --page 1`; read the ID from the table's ID column. Do not wait | **no** |
| **Mirror DiamWall-blocked** | `zlib doctor --eapi --json` (also `zlib doctor --json`); parse `status`, not exit code (always 0) | Per-domain statuses: usable `healthy`/`challenged`; unusable `diamwall_blocked`/`http_error`/`redirect_loop`/`network_error`. Logged-in calls then fail with e.g. `zlibrary: blocked by anti-bot protection (HTTP 517) at …`, `zlibrary: unexpected HTTP status 503 at …`, `zlibrary: too many redirects` (quoted in upstream README; not reproducible logged out) | **Handoff text** — pick a `healthy`/`challenged` domain for EAPI, have the user put `ZLIB_DOMAIN=https://…` in `~/.config/zlib/.env` (show the absolute path; create 0600 without overwriting; optional `ZLIB_PROXY`), then retry. Login stays the user's step | **yes** |
| **Not logged in** | Preflight `zlib profile` (reliable); also `search`/`history`/`download` | stderr `Not logged in. Run: zlib login`, exit **1**, empty stdout. (A stale/synthetic session file can let `search` succeed, so never use search as the probe) | **Handoff text** — same friendly separate-terminal `zlib login` message; **never run `zlib login`**, never pass credentials as flags; wait | **yes** |
| **Session expired** | `zlib profile` / `zlib profile --json` (EAPI included) then any command | HTML mode: ``✗ Error: zlibrary: session expired, run `zlib login` to re-authenticate``, exit **1** (`download` prefixes `failed to fetch book:`; `history --download` prefixes `failed to load history page N:`). EAPI mode: `✗ Error: zlibrary: EAPI profile failed: Invalid credentials` (or `EAPI history failed: …` / `EAPI search failed: …`) | **Handoff text** — reuse the same login handoff; wait | **yes** |

## 8. Strings available for tests

### 8a. Skill-text assertions (current synced `skills/zlib/SKILL.md`, 183 lines; line numbers at probe time)

Provenance: **U** = upstream text (vendored commit 6a299fd), **A** = project adaptation documented in README (flat `kindle`, no Homebrew tap, DiamWall section).

| Exact substring | Location | Provenance |
| --- | --- | --- |
| `BIN_MISSING` | 18, 25, 29 | U |
| `BIN_OK` | 18, 25 | U |
| `command -v zlib` | 18 | U |
| `Not logged in. Run: zlib login` | 32 | U |
| `session expired` | 32, 161 | U |
| ``Never run `zlib login` yourself`` | 35 | U |
| `not recognized` | 65 | U |
| `zlib doctor --eapi --json` | 183 | A |
| `healthy` | 183 | A |
| `challenged` | 183 | A |
| `diamwall_blocked` | 183 | A |
| `http_error` | 183 | A |
| `redirect_loop` | 183 | A |
| `network_error` | 183 | A |
| `ZLIB_DOMAIN` | 162, 166, 178, 183 | U (162/166/178), A (183) |
| `ZLIB_PROXY` | 162, 166 | U |
| `ZLIB_DOWNLOAD_DIR` | 71, 76, 78, 84, 86, 90, 92, 108, 110, 122, 138 | U |
| `~/.config/zlib/.env` | 166, 183 | U / A |
| `~/.config/zlib/session.json` | 35 | U |
| `Saved to:` | 92, 110, 155 | U |
| `Downloading…` | 110 | U |
| `go install github.com/heartleo/zlib/cmd/zlib@latest` | 30, 92, 124 | U |
| `zlib search` (no query) | 41 | U (golden rule) |
| `zlib history` | 42 | U (golden rule) |
| `zlib kindle` / `zlib kindle send` | 43 | U (golden rule) |
| `kindle` (flat skill name) | 3, 35, 146, 148 | A |

Negative assertions that should pass after sync: skill text **does not contain** `zlib:kindle`, **does not contain** `brew install` (the Homebrew-tap sentence was removed; the README keeps the warning), **does not contain** `unknown flag`, **does not contain** `EAPI`, **does not contain** `engines.dsh` or `harnessRange`, and **does not contain** `Domain is not configured` / `Invalid Z-Library domain`.

### 8b. CLI-output assertions (exact literals observed on v0.0.8)

| Literal | Produced by | Stream / exit |
| --- | --- | --- |
| `zlib version v0.0.8` | `zlib version` / `zlib --version` / `zlib -v` | stdout / 0 |
| `BIN_MISSING` | the preflight probe with no zlib on PATH | stdout / probe exit 0 |
| `Not logged in. Run: zlib login` | `profile`, `profile --json`, `search … --json`, `history --json`, `download …` with no session | stderr / 1 |
| `✗ Error: unknown flag: --json` | old binary / `download --json` | stderr / 1 |
| `✗ Error: accepts 1 arg(s), received 0` | `zlib download` | stderr / 1 |
| ``✗ Error: zlibrary: session expired, run `zlib login` to re-authenticate`` | HTML-mode expired session (profile/history) | stderr / 1 |
| `✗ Error: failed to fetch book: …` | `download` fetch failures (expiry, parse, no ID) | stderr / 1 |
| `✗ Error: zlibrary: EAPI profile failed: Invalid credentials` | EAPI-mode bad/expired session, `profile` / `profile --json` | stderr / 1 |
| `✗ Error: zlibrary: search query is empty` | `search "" --json` | stderr / 1 |
| `Domain is not configured. Set ZLIB_DOMAIN or run zlib login --domain URL again.` | session without domain, no `ZLIB_DOMAIN` | stderr / 1 |
| `Invalid Z-Library domain: domain must be an HTTPS origin` | invalid `ZLIB_DOMAIN` | stderr / 1 |
| `Invalid Z-Library domain: domain "example.com" is not in the allowed Z-Library suffix list` | non-allowlisted domain | stderr / 1 |
| `✗ Error: invalid proxy URL` | `zlib doctor --proxy foo` | stderr / 1 |
| `✗ Error: unsupported proxy scheme "ftp"` | `zlib doctor --proxy ftp://…` | stderr / 1 |
| `healthy` / `challenged` / `diamwall_blocked` / `http_error` / `redirect_loop` / `network_error` | `zlib doctor --json` statuses | stdout / 0 |
| `✓ Found 3 results · Page 1 / 3` | static `search` table | stdout / 0 |
| `✓ Logged out.` | `zlib logout` | stdout / 0 |
| `✓ Saved to: <path> (<n> bytes)` + `  Downloading: <name>` | successful no-TTY download **[source-only, not observed live]** | stdout / 0 |
| `bash: zlib: command not found` | invoking zlib with it off PATH | stderr / 127 |

### 8c. Host-side literals (engines.dsh row)

```console
$ node scripts/verify-host.mjs
# host dsh 0.2.1-rc.2, electron 44.7.0
ok - engines.dsh accepts this package on the running host: no unmet requirements
ok - engines.dsh far above the host is refused: {"engines.dsh":">=99.0.0"}
ok - startup skips a bundle whose engines.dsh does not match: [{"packageName":"dsh-zlib-plugin","reason":"Error: Plugin dsh-zlib-plugin@1.1.0 is incompatible with dsh 0.2.1-rc.2: requirements {"engines.dsh":">=99.0.0"}. Running it may cause crashes or data loss. …"}]
```

Testable substrings: `engines.dsh`, `{"engines.dsh":">=99.0.0"}`, `is incompatible with dsh`, `skippedBundles` / `startup skips a bundle whose engines.dsh does not match`, `dsh plugin allow-version`, `Exact-version exemption: not active`. Current manifest: `"engines": {"node": ">=20", "dsh": ">=0.2.0-rc.2 <0.3.0"}`; the running host 0.2.1-rc.2 satisfies it. There is no `dsh.harnessRange` field in the manifest (and the host bundle contains no `harnessRange` string — that field was invented).

## 9. Gaps where the skill text does not cover a required failure surface

Reported to the Lead; skills were **not** edited here.

1. **EAPI-mode auth failures are invisible to the skill's trigger phrases.** The skill only watches for `Not logged in` and `session expired`; in EAPI mode an expired/invalid session prints `✗ Error: zlibrary: EAPI profile failed: Invalid credentials` (and `EAPI history failed: …`, `EAPI search failed: …`). An agent following the skill literally can misclassify this as a network error. Required: treat any `EAPI (profile|history|search) failed` / `Invalid credentials` from `zlib profile` as the same login handoff. This is the only **hard** gap for the "session expired" row.
2. **Domain-configuration errors are not named.** `Domain is not configured. Set ZLIB_DOMAIN or run zlib login --domain URL again.`, `Invalid Z-Library domain: domain must be an HTTPS origin`, and `…not in the allowed Z-Library suffix list` are configuration failures (no request is made) with the same remediation as DiamWall; the skill's network bullet is generic and does not name these strings.
3. **`unknown flag: --json` vs `not recognized`.** The skill says "not recognized"; the CLI literal is `unknown flag: --json`. A test must assert the skill phrase and the CLI phrase separately; the skill intentionally has no `unknown flag` string.
4. **`ZLIB_DOWNLOAD_DIR` is documented by the synced skill but not implemented by the installed CLI.** v0.0.8 is the newest **release** (`go list -m -versions` ends at v0.0.8) and its source/binary have no `ZLIB_DOWNLOAD_DIR` fallback: `destDirFlag()` only reads `--dir` (default `"."`), the help line is `Destination directory. (default ".")`, and the literal appears **0** times in the binary. The feature exists only on main (`v0.0.9-0.20260907080718-6a299fdc5992`: `downloadDirEnvVar = "ZLIB_DOWNLOAD_DIR"`, help `Falls back to $ZLIB_DOWNLOAD_DIR when omitted`). The skill's hedge ("Older zlib builds ignore `ZLIB_DOWNLOAD_DIR` … pass `--dir` explicitly … suggest `go install …@latest`") correctly detects it, but `@latest` installs v0.0.8 again, so the suggested upgrade cannot fix it. Consequence on this machine: if the user has `ZLIB_DOWNLOAD_DIR` set and the agent omits `--dir`, the file lands in the cwd; trust the `Saved to:` line and pass `--dir`. Tests should assert the hedge text, not that the installed binary honours the variable.
5. **`engines.dsh` unsatisfied cannot be covered by `SKILL.md`.** When the bundle is skipped the skills are not registered, so no skill text is loaded to react. The required response is stop/user-action and it lives in the README failure table + `test/host-contract.test.js` / `scripts/verify-host.mjs`; do not assert skill text for it.
6. **`zlib doctor` exit code carries no health information** (always 0, even all-`network_error`). The skill says to pick by `status` (correct), but any test/agent that checks exit status will pass on a fully blocked network. Documented here so the contract test parses JSON, not exit codes.
7. **Full-line wording differs per command.** `session expired` arrives with the prefix `✗ Error: zlibrary:` and, for `download`, an extra `failed to fetch book:` wrapper (`history --download`: `failed to load history page N:`). Tests must match a substring (`session expired`, `zlib login`) rather than a whole line; no skill change needed.
8. **Homebrew tap is live on this machine** (`/opt/homebrew/bin/zlib`, formula `heartleo/tap/zlib 0.0.8`, `brew info zlib` warns it shadows `homebrew/core/zlib`). The synced skill removed the tap from the install handoff (adaptation); the README keeps the `brew uninstall zlib` remediation. No regression, but tests that assert "no `brew install`" must target `skills/`, not `README.md`.

## Appendix A — evidence paths

* Shipped binary: `~/.local/bin/zlib` → `~/go/bin/zlib`; `go version -m` confirms `github.com/heartleo/zlib v0.0.8`.
* Exact source of the shipped binary: `~/go/pkg/mod/github.com/heartleo/zlib@v0.0.8/` (`internal/cli/{root,download,search,history,profile,doctor,tty,json,dotenv,path,login,colors}.go`, `client.go`, `download.go`, `eapi*.go`, `domain_probe.go`, `model.go`, `errors.go`, `internal/config/*.go`).
* Main-branch snapshot: `~/go/pkg/mod/github.com/heartleo/zlib@v0.0.9-0.20260907080718-6a299fdc5992/` (commit `6a299fdc59927f7e84f94390c4e54bfaf4d06cee`, also vendored under `upstream/heartleo-zlib-6a299fdc59927f7e84f94390c4e54bfaf4d06cee/`).
* Upstream remediation text: `/tmp/upstream/README.md` lines 94-125 and 265-285 (vendored README is the same commit).
* Host compatibility code/diagnostics: `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar` (`plugin-compatibility.js` region); live proof `node scripts/verify-host.mjs` (# host dsh 0.2.1-rc.2, electron 44.7.0).
* Current skill text: `skills/zlib/SKILL.md` (183 lines), `skills/kindle/SKILL.md` (80 lines); upstream bodies in `upstream/…/plugins/zlib/skills/`.
* Synthetic-session hives (disposable, outside the repo): `/tmp/zlib-probe-home`, `/tmp/zlib-probe-home-expired`, `/tmp/zlib-probe-home-eapi`, `/tmp/zlib-probe-home-logout`, `/tmp/goprobe`.

## Appendix B — environment caveats for future probes

* macOS has no `timeout` binary — use the bash tool's `timeoutMs`.
* Never run bare `zlib search` / `zlib history` / `zlib kindle`; never run `zlib login` at all. With no TTY, use the documented static/JSON forms only.
* `zlib doctor --eapi --json` is the only safe pre-login probe of mirror health; it is network-bound (~seconds to ~2 minutes) and always exits 0.
* Do not rely on `command -v zlib` alone to prove the right binary on this machine (three PATH hits, Homebrew tap installed); `zlib version` and `go version -m` are the truth.
