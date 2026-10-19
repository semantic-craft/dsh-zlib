# dsh-zlib

DeepSeek Harness 的 skills-only bundle（`zlib`、`kindle` 两个技能），线上由 `~/.dsh/profiles/desktop/package.json` 按 `github:semantic-craft/dsh-zlib#<release-commit>` 安装，开发时可改用 `link:` 挂载本目录。用途、安装和失败面见 [README.md](README.md)。

- 技能正文跟随上游 `heartleo/zlib`，只改外层打包；改技能先读 [docs/upstream.md](docs/upstream.md)，用 `node scripts/sync-upstream.mjs` 同步，不手改 vendored 正文。
- 验证命令见 README 的 Verification 节；最少运行 `node --test` 和 `node scripts/sync-upstream.mjs --check`。host 测试仅在装有 DSH 的机器运行。
- profile 改用 `link:` 挂载本目录时，移动或改名前同步修改 DSH profile 并重新验证挂载。
- zlib CLI 行为事实在 [docs/zlib-cli-facts.md](docs/zlib-cli-facts.md)；教训记录在 [lessons.md](lessons.md)。
