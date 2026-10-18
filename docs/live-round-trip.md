# Live round trip — search, table, download by ID

Recorded 2026-10-18 after the user signed in from their own terminal with
`zlib login --eapi --domain https://z-lib.gd` (the CLI never ran the login and
never received credentials). Every command below is the form the bundled
`zlib` skill documents.

## Preflight

```console
$ zlib profile --json
{"daily_amount":0,"daily_allowed":10,"daily_remaining":10,"daily_reset":""}

$ node -e '…read ~/.config/zlib/session.json, redact cookies…'
{ "keys": ["cookies", "domain", "mode"], "cookies": "<redacted>",
  "domain": "https://z-lib.gd", "mode": "eapi" }
```

## Search — `zlib search "<query>" --json --count 10`

```console
$ zlib search "the pragmatic programmer" --json --count 10
{"books":[…10 items…],"page":1,"total_pages":46}
```

Rendered as the skill requires (markdown table, every row, IDs straight from the
JSON's `id`):

| # | ID | Title | Authors | Year | Format | Size | Rating |
|---|---|---|---|---|---|---|---|
| 1 | `646873:6d17f7` | Manage Your Project Portfolio: Increase Your Capacity and Finish More Projects (Pragmatic Programmers) | Johanna Rothman | 2009 | pdf | 2.70 MB | 0 |
| 2 | `655590:9d50cc` | The Passionate Programmer: Creating a Remarkable Career in Software Development (Pragmatic Life) | Chad Fowler | 2009 | pdf | 1.16 MB | 3.0 |
| 3 | `29617255:7a554e` | The Pragmatic Programmer | David Thomas, Andrew Hunt | 2020 | epub | 3.73 MB | 5.0 |
| 4 | `21578303:a356b0` | The Pragmatic Programmer - 20th Anniversary Edition | David Thomas, Andrew Hunt | 2020 | pdf | 4.33 MB | 5.0 |
| 5 | `23982636:4e5e36` | The Pragmatic Programmer: Your Journey To Mastery, 20th Anniversary Edition, 2nd Edition | David Thomas, Andrew Hunt | 2019 | epub | 2.65 MB | 5.0 |
| 6 | `23997638:c345cc` | The Pragmatic Programmer for Machine Learning: Engineering Analytics and Data Science Solutions | Marco Scutari, Mauro Malvestio | 2023 | pdf | 7.68 MB | 5.0 |
| 7 | `24925785:53e692` | The Pragmatic Programmer: your journey to mastery, 20th Anniversary Edition, 2nd Edition | Andrew Hunt, David Thomas | 2019 | pdf | 4.16 MB | 5.0 |
| 8 | `30845095:15be62` | Programming Ruby 3.3: The Pragmatic Programmers' Guide (Pragmatic Programmers; Facets of Ruby), 5th Edition | Noel Rappin, Dave Thomas | 2023 | pdf | 10.26 MB | 5.0 |
| 9 | `28433175:df1c47` | Programming Ruby 3.3: The Pragmatic Programmers' Guide (Pragmatic Programmers; Facets of Ruby), 5th Edition | Noel Rappin, Dave Thomas | 2024 | epub | 4.49 MB | 0 |
| 10 | `928904:807a85` | Pragmatic Thinking and Learning: Refactor Your Wetware (Pragmatic Programmers) | Andy Hunt | 2008 | pdf | 7.47 MB | 5.0 |

## Download — `zlib download <id> --dir <existing dir>`

```console
$ mkdir -p /tmp/zlib-roundtrip
$ zlib download 29617255:7a554e --dir /tmp/zlib-roundtrip
  Downloading: The Pragmatic Programmer

✓ Saved to: /tmp/zlib-roundtrip/The Pragmatic Programmer (David Thomas, Andrew Hunt).epub (3912488 bytes)

$ file '/tmp/zlib-roundtrip/The Pragmatic Programmer (David Thomas, Andrew Hunt).epub'
EPUB document
$ shasum -a 256 '/tmp/zlib-roundtrip/The Pragmatic Programmer (David Thomas, Andrew Hunt).epub'
f198fd9c0ee8dc49e5ed08b20887cedb3e25d7793589e393e0dffa9da9b71dbe  …

$ zlib profile --json
{"daily_amount":1,"daily_allowed":10,"daily_remaining":9,"daily_reset":""}
```

The size matches the search row (3.73 MB), the MIME type is a real EPUB, and
the quota moved 0 → 1 of 10, so the download was account-backed rather than a
cached response. `--dir` was passed explicitly per the release-build note in the
skill (v0.0.8 has no `ZLIB_DOWNLOAD_DIR` fallback).
