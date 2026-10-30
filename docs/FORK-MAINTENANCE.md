# davidLi17 maintenance record

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
