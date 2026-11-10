# davidLi17 maintenance record

## 26.11.10-lhg.2 — validate the DSH 0.2.2-rc.1 executor split

Base: `c9881faa4f1920163a63e03a8a727516fbf40909`. Host source:
DeepSeek Harness `v0.2.2-rc.1`, `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`.
The published rc.1 graph uses Cordis 4.1.0, scoped Native/PTC executor plugins,
batch `tools.execute`, public `tools.definitions`, and the working-directory service.
OPS registers capabilities; it does not implement or shim the host batch executor.

Use public lossless definitions on rc.1, with stable per-definition cache identities,
without reading its private registry view or copying schemas. Older hosts retain their
existing fast view path and fallback. Add a regression that fails on the old path.
Admit exactly rc.1 alongside the previously supported bounded range. Do not claim
compatibility with untested 0.2.2 release candidates or stable releases.

新增公开工具 definitions 适配与独立真实 rc.1 安装 gate，保留旧宿主、PTC、
Windows 盘符权限、Bash 路径持久化、现有运行后端、配置和离线迁移，不改工作流。

`test/compat/host-rc1.mjs` drives the installed candidate through real Session,
Native/PTC batch executors, Node PTC processes, workingDirectory, subprocess and native worker.
It checks Native reads and ordered failures, scoped next-step discovery, typed nested PTC
reads/copies, SDK loading, cancellation, executor withdrawal, stale callbacks and metadata.
The locked old-host graph remains unchanged for regression CI. The rc.1 gate has its own
isolated published graph, so it cannot accidentally test against the old peer graph.

Promotion requires successful same-commit CI, four freshly built platform runtimes,
release closure/manifest checks and actual packed installation with the rc.1 integration gate.
Use existing Actions branch dispatch artifacts only; no npm or GitHub Release publication.
Linux host integration is not a claim that the user's desktop was changed or tested.

## 26.11.10-lhg — preserve per-mode Bash path edits

Base: `dfa85e1437daa801286357657c0369e36cf01fd8`.
Evaluated source: T-Auto/dsh-ops formal `v0.5.2`,
`fa997b81d9088e11427b9aec5eb6a46b26671cd9` (not a draft or prerelease).
The source and retained fork are MIT; historical and third-party notices are unchanged.

Select only the `src/settings/merged.ts` Bash-path descriptor fix: the real host settings
writer can now persist and clear `bashPath` for Minimal, Standard, PTC and Cordis without
changing other saved switches. The regression uses this fork's pinned host writer directly;
it does not import the newer Niubash executor-selection UI or claim that UI is present.
The new assertion fails before the fix with `Config field "minimal.bashPath" is not volatile`.

仅合入正式版 v0.5.2 的每模式 `bashPath` 设置描述修复，使宿主设置写入器能够保存和清除路径，
保留其它开关及已有配置；不引入上游新版 Niubash 选择界面，不自动修改已安装配置。

Preserved: fork PTC/nested tools and schema optimizations, Windows drive authority,
POSIX host-shell panel, offline migration/backup, existing host adapter and permissions.
Deferred: v0.5.1/v0.5.2 Niubash hardlink/cache changes (the fork still uses its existing backend),
new indexing/definitions tools, the 0.2.2-only host migration and unrelated workflow changes.
Native implementation and dependencies are unchanged. Package and native version declarations
remain aligned; promotion requires same-commit four-platform Release artifacts, CI and actual
packed-install verification. Use Actions `release-dist`; do not publish npm or a GitHub Release.

## 26.11.9-lhg — selective stable 0.5.0 fixes

Base: `ff5259819720f3c47e6450da6e0db41a7f4b6cb6`.
Evaluated source: T-Auto/dsh-ops formal `v0.5.0`,
`904b4faa2afab722699cba31f2aa92c5d4d0dcbe` (not a draft or prerelease).
The source and retained fork are MIT; historical and third-party notices are unchanged.

The 26.11.7 candidate was never published; this release continues its commits without rewriting them.
The release-only manifest now removes the source-checkout prepack hook, so DSH can repack compiled
artifacts normally without missing build scripts. Source-checkout builds and integrity checks remain enabled.
此版继续未发布的 11 月 7 日候选；成品清单移除仅用于源码构建的 prepack，避免 DSH 安装时重新打包失败，不关闭脚本策略或供应链校验。

Selected fixes only:
- `61b0e58`: exclude Windows Store's WSL Bash alias from system fallback, retaining Git Bash selection.
- `cc6086c` (settings portion): detect pwsh7 from the owning profile, do not persist an untouched detected link, and save explicit on/off choices.
- `9dddd15`: build Windows IPC proxies with Unicode environment paths and ASCII batch instructions, preserving existing IPC source and permissions.
- `a12b790`: accept npm 12 package-keyed pack reports through strict identity/path validation; retain repaired tar hashes and provenance.

Preserved: fork PTC/nested tools and declaration refresh, Windows drive authority,
POSIX host-shell panel, offline migration/backup, old-host adapter, and all permissions.
Deferred: the 0.2.2-only host migration, Niubash backend switch, new default PowerShell hiding,
WSL delegation, indexing and unrelated publication/native changes. This remains a selective fork,
not a complete upstream 0.5.0 installation. No workflow, dependency or security setting is changed.

仅合入上述四组正式版修复，保留 PTC、Windows、POSIX 面板与离线迁移定制；
不整体升级至要求 DSH 0.2.2 的上游架构，不替换 Niubash 后端，不自动修改用户配置。
主包与原生版本统一，但原生实现未变；仍要求同提交四平台 Release 构建、完整 gate 和安装包核验。
安装渠道继续使用本仓库 Actions 的 `release-dist`，不发布 npm 或 GitHub Release。

## 26.11.3-lhg — POSIX runtime panel

- Local UI fix on `3f44d592df5478c615d36f7eb224c5076f0c13cf`, not an upstream merge.
- Latest stable evaluated: v0.4.4 `fc11890f7668c9912fcde1df1ca89810e1cbc031`; existing equivalent fixes retained. v0.5.0-alpha4 is a prerelease and excluded.
- Built-in presets publish OPS Bash only on Windows (`src/presets/builtin.ts`). POSIX support in the low-level resolver does not mean built-in Mac presets publish OPS Bash.
- macOS/Linux details now explain host shell use, hide Windows inventory/install controls, and avoid probing the Windows companion plugin. Custom integration behavior is unchanged; no shell readiness is invented.
- 自用修复：Mac/Linux 内置预设使用宿主 Shell，原面板将 Windows Bash 清单当作所有平台状态，导致误报；现隐藏无关安装项。底层 POSIX resolver 能力不等于内置预设启用 OPS Bash，自定义集成及执行权限不变。
- Tests extend the existing UI suite only. Publication requires same-commit four-platform native artifacts, release gate, and matching package/native versions; source-only main is not an installable distribution.


## 26.10.31-lhg — requested 0.5 improvements

Base: `ad78e2b0deee75ecb0b42b140ee7fb7146e81532` (0.4.4).
Evaluated source: T-Auto/dsh-ops `v0.5.0-alpha3`,
`ffc3da7aea49db3f4ad67153893fd70ad77b5542` (**upstream prerelease**, not stable).
User explicitly requested these improvements on 2026-10-31 Asia/Shanghai.
This is an exception for this release, not a change to stable-only future tracking.

Absorbed and reviewed as an integrated single-row/publication change:
- [#464](https://github.com/T-Auto/dsh-ops/pull/464), `1fac998` and `1c35636`: reconcile only affected sessions, avoiding repeated planning for unrelated sessions.
- [#475](https://github.com/T-Auto/dsh-ops/pull/475), `0ddd199`: use live session cwd with existing Windows drive authority handling.
- [#472](https://github.com/T-Auto/dsh-ops/pull/472), `4df972a`, `58f8727`, `7ba72a4`: one settings page, separate resident and dynamically loaded tools. Related publication/projection and consumer composition changes are required by this model.
- [#465](https://github.com/T-Auto/dsh-ops/pull/465), `6e4b8ad`: Windows result-cache preparation without unnecessary workspace grants.
- [#492](https://github.com/T-Auto/dsh-ops/pull/492), `dbd891c`, `b0e9c81`: confined Bash cache generations, leases and explicit offline cleanup.
- [#414](https://github.com/T-Auto/dsh-ops/pull/414), `436557b`, `0b9077d`: support hosts that defer the wire tools array.
- [#485](https://github.com/T-Auto/dsh-ops/pull/485), `2f8c921`: stable PTC declaration generation across the supported host range.
- [#499](https://github.com/T-Auto/dsh-ops/pull/499): upstream Unix executable TAR mode fix replaces the functionally equivalent fork patch; retained payload/header/checksum regressions.

Preserved fork behavior: PTC nested official tool availability, first-prompt declaration refresh,
cleanup-failure safety, public bounded known-name visibility lookup instead of full schema copying,
Windows drive handling. No access policy or host client changes.
The unrelated PDF outline implementation from #432 is intentionally NOT absorbed;
its three native source/test files remain at the base revision. Upstream changelog entries
are historical source information, not claims of inclusion in this fork.
Thus upstream ancestry is not a statement that every upstream feature is enabled or adopted.

Configuration is not rewritten automatically. Before activating the new bundle, back up and
review the explicit [offline migration](fork-migration.en.md) / [中文迁移](fork-migration.zh.md).
Unsupported/ambiguous overrides fail without writing output; installed profiles are never discovered or modified.

Distribution: existing branch-only Release workflow, same-commit four-platform native workers;
GitHub Actions `release-dist` artifact (7 days), not npm or a GitHub Release.
A source-only `github:main` install is not a runtime-bearing distribution.
Build/test receipts are the associated exact-commit Actions run, not this source document.
