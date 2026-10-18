# Telling a real Z-Library domain from a phishing clone

Z-Library rotates domains constantly and copycats clone its visual design to
harvest passwords and donations (Wikipedia's own article says so, and warns
editors about it). There is no single check that proves a domain, but the
combination below is what makes a decision defensible. Everything here was run
on 2026-10-18 from this machine.

## Sources of truth, strongest first

1. **Z-Library's own announcements.** The official Mastodon account is public
   and readable without an account:
   ```bash
   curl -sS 'https://mastodon.social/api/v1/accounts/lookup?acct=Z_Lib_official'
   # then list its statuses; they name working domains when they change
   ```
   Its 2026-01-30 post, for example, names `z-library.sk`, `z-lib.sk`,
   `z-library.gy` as the then-current official links. The Tor onion address,
   the official apps, and the support addresses in those posts are the other
   primary channels.
2. **The `heartleo/zlib` allowlist.** The CLI hard-codes the only hostname
   suffixes it will ever contact (`domain_policy.go`) and refuses everything
   else with *"not in the allowed Z-Library suffix list"*. It is a curated
   trust boundary for CLI use: `z-lib.gd`, `z-lib.gl`, `z-library.ec`,
   `zlib.bz`, `article.sk`, `articles.sk`, `zliba.ru` (working for EAPI when
   measured), plus the DiamWall-blocked `1lib.sk`, `z-lib.fm`, `z-lib.sk`.
3. **Wikipedia is secondary.** Its infobox cites the official Mastodon/X
   accounts but is volunteer-edited, and the article itself carries a
   "be careful adding domains" warning plus a [Fraudulent
   domains](https://en.wikipedia.org/wiki/Z-Library#Fraudulent_domains)
   section. Treat it as a lead to check, not as proof.

## Technical fingerprints (what we measured)

| Domain | Response to a plain GET | Verdict |
| --- | --- | --- |
| `https://z-lib.gd` | `503`, nginx, `X-Zbackend: v2-02`, `X-ZProxy: front-proxy`, `X-Cache-Status: MISS`, `Set-Cookie: bsrv=…`, body `<title>Checking your browser ...</title>` (Z-Library's JS proof-of-work page); `/eapi/info/domains` returned `{"success":1,"domains":[{"domain":"z-library.sk",…},{"domain":"1lib.sk",…},…]}` | genuine front proxy; CLI EAPI default, login works |
| `https://zlib.bz` | identical headers, identical 9592-byte challenge body, same `bsrv` cookie | same official front |
| `https://z-library.sk` | `307` with `Set-Cookie: __diamwall=…` and body `DiamWall` | Z-Library's own anti-bot, i.e. genuine infrastructure |
| `https://z-library.bz` | different stack: `HTTP/2`, `server: 5.252.32.32`, `Set-Cookie: __js_p_=…`, 13602-byte interstitial with a 66×66 base64 GIF and `noindex`; no `X-Zbackend`/`X-ZProxy`; `/eapi/info/domains` and `/eapi/user/profile` returned the interstitial HTML, not the EAPI JSON | **unconfirmed** — do not authenticate here until an official channel names it |

Note the near-miss: **`zlib.bz`** (on the CLI allowlist, official front) is not
**`z-library.bz`** (different hostname, different stack). One extra
`-library` is exactly the pattern copycats use.

Caveats that keep this honest:

- Fingerprints are copyable and Z-Library changes its anti-bot stack. A missing
  fingerprint is a caution flag, not proof of fraud; a present one is not proof
  of authenticity either.
- This machine's DNS returns `198.18.x.x` answers (a proxy's fake-IP range), so
  IP/ASN comparisons are meaningless here; the HTTP-level checks above still are.
- `singlelogin.re` was not reachable from this network (TLS handshake failure),
  so the official login portal could not be consulted live today.

## Checklist before typing a password

1. Get the current domain from an official channel (Mastodon post, onion
   address, official app) — never from a search-engine result or an ad.
2. Compare the hostname character by character with the announced one
   (`z-lib` vs `z-library`, `.gd`/`.bz`/`.sk`, no trailing junk).
3. In a browser, open `https://<domain>/eapi/info/domains`: a real EAPI host
   answers with JSON containing `"success":1` and a `domains` array; a clone
   usually 404s or returns the page HTML.
4. Look at the response headers/challenge: `X-Zbackend`/`X-ZProxy`/the
   `Checking your browser` proof-of-work page, or the `__diamwall` cookie.
5. Check certificate issuance history with Certificate Transparency
   (`https://crt.sh/?q=<domain>`); a domain with a days-old certificate and no
   history is a red flag. `openssl s_client -connect <domain>:443 -servername <domain>`
   shows the current certificate.
6. Prefer not typing the password at all: import a browser session with
   `zlib login --cookies <netscape-cookie-file>` from a domain you already
   verified, or use the CLI as-is (it will only ever contact its allowlist).
7. Use a unique password and a password manager scoped to the exact domain, and
   enable 2FA where offered.
8. If you already authenticated on a domain you are not sure about: change the
   password from a verified domain and, if available, sign out other sessions.

## For the zlib CLI specifically

The CLI cannot be pointed at an unverified host: `zlib login --eapi --domain
https://z-library.bz` fails *"not in the allowed Z-Library suffix list"*.
On this machine the working session is on `https://z-lib.gd` and the CLI
recorded it in `~/.config/zlib/session.json` and `~/.config/zlib/.env`.
Browser use of domains outside that list — including `z-library.bz` — is
outside what the CLI protects you from, so the checklist above applies.
