# Fork: migrate saved eight-row settings

[中文](fork-migration.zh.md)

The unified Plugins page does **not** automatically transfer settings from retired rows.
Before activating the upgrade, make a backup of your old profile patch and generate a review copy:

```sh
npm ci --ignore-scripts
npm run build
node bin/migrate-profile.mjs /path/to/old-patch.yml /path/to/NEW-review-patch.json
```

Run from this checkout. The input must be an explicitly supplied JSON/YAML **patch array**,
not a dump of the composed configuration. JSON input needs only the built package; YAML input
uses the checkout's existing `yaml` development dependency. Output is always JSON (also valid
YAML). The tool never searches for DSH home, contacts a service, reloads DSH, or installs a profile.
It refuses the same path or any existing output, including symlinks, and creates the new file with
owner-only permissions where the filesystem supports them. Keep the backup; review the diff and
apply the reviewed copy yourself using the normal profile-editing procedure. Restart/reload and
check the unified switches before starting a session. File formatting/comments are not preserved;
unrelated patch data and order are preserved.

## What is transferred

- Stable `dsh-ops-mode-minimal`, `-mode-standard`, `-mode-ptc`, `-mode-cordis`,
  `-discovery`, `-compat`, `-panel`, and `-tui` IDs, with matching names when present.
- Ordinary row overrides and simple `insert` arrays. The result contains a single `dsh-ops`
  override; unrelated rows remain in place. Use it with the new single-row bundle, not the old bundle.
- Valid supported configuration values, worker paths, limits and tool lists; row `disabled`
  becomes section `enabled`. For a partial override, omitted `disabled` follows the old bundle
  default (panel/TUI/compat off). An inserted row follows normal enabled-by-default semantics.
- `publishBashTool` is retained and also copied to `bash`, so a saved false remains off.
- Discovery's old `config.enabled` is combined with row enablement; either false keeps it off.
- Panel `capture: false` remains false, including when the panel row is enabled.
- Enabled compatibility becomes `global.hideOfficialTools: false` and `global.hidePwsh: false`.

## Deliberate refusals

No output is written for duplicate legacy rows, an existing unified row, mismatched IDs/names,
conditional `disabled` expressions, nested/positioned/removal operations involving OPS, unknown
keys, or older `shell`/`file`/`ptc`/`background`/`hide-official` rows. Legacy-only FastCtx keys,
`shellPolicy`, `deniedHostTools` and `configUpdateVersion` also require manual review rather than
being silently discarded. The error identifies the patch location/key. Resolve those cases in a
**copy**, preserving the original, then rerun or migrate manually. OPS references inside unusual
unrelated data may also trigger a conservative refusal. YAML duplicate keys and aliases are rejected.

This is a settings transfer helper, not a guarantee of identical runtime behavior across versions.
It validates against the merged settings resolver without loading a host, granting permissions,
starting capture or executing tools. Test it with `node test/run.mjs fork-profile-migration`.
