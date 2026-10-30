import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assert, test, report } from './lib/harness.mjs'
import { migrateProfile, migrateFile } from '../bin/migrate-profile.mjs'
import { resolveMergedConfig, effectiveMode } from '../lib/settings/merged.js'
const row = (suffix, rest = {}) => ({ id: `dsh-ops-${suffix}`, name: `dsh-ops/${suffix}`, ...rest })

await test('all eight rows migrate with disabled, capture and unrelated choices intact', () => {
  const foreign = { insert: [{ id: 'theme', name: 'theme', config: { color: 'blue' } }] }
  const input = [foreign, ...['minimal', 'standard', 'ptc', 'cordis'].map(name => row(`mode-${name}`, {
    disabled: name === 'standard', config: { publishBashTool: false, required: false },
  })), row('discovery', { config: { enabled: false, maxResults: 2 } }), row('compat', { disabled: false }),
  row('panel', { disabled: false, config: { capture: false, textLimit: 777 } }), row('tui', { disabled: true, config: { recentLimit: 4 } })]
  const before = JSON.stringify(input), result = migrateProfile(input), cfg = result[1].config
  assert.equal(JSON.stringify(input), before)
  assert.deepEqual(result[0], foreign)
  assert.equal(result.length, 2)
  assert.equal(cfg.standard.enabled, false)
  for (const name of ['minimal', 'standard', 'ptc', 'cordis']) assert.equal(cfg[name].bash, false)
  assert.equal(cfg.discovery.enabled, false)
  assert.equal(cfg.panel.enabled, true); assert.equal(cfg.panel.capture, false); assert.equal(cfg.panel.textLimit, 777)
  assert.equal(cfg.tui.enabled, false); assert.equal(cfg.tui.recentLimit, 4)
  assert.deepEqual(cfg.global, { hideOfficialTools: false, hidePwsh: false })
  const resolved = resolveMergedConfig(cfg)
  assert.equal(effectiveMode(resolved.minimal, resolved.global).bash, false)
  assert.equal(effectiveMode(resolved.ptc, resolved.global).hidePwsh, false)
})
await test('partial overrides retain opt-in defaults and inserted rows retain their explicit enablement', () => {
  const cfg = migrateProfile([row('panel', { config: { textLimit: 900 } }), row('tui'), row('compat')])[0].config
  assert.equal(cfg.panel.enabled, false); assert.equal(cfg.tui.enabled, false); assert.equal(cfg.global, undefined)
  const inserted = migrateProfile([{ insert: [row('panel', { config: { capture: false } }), { id: 'foreign' }] }])
  assert.deepEqual(inserted[0], { insert: [{ id: 'foreign' }] })
  assert.equal(inserted[1].config.panel.enabled, true); assert.equal(inserted[1].config.panel.capture, false)
  assert.equal(migrateProfile([row('discovery', { disabled: true, config: { enabled: true } })])[0].config.discovery.enabled, false)
})
await test('unsafe or ambiguous overrides fail with precise reasons', () => {
  for (const [input, message] of [
    [[row('panel'), row('panel')], /duplicate dsh-ops-panel/],
    [[{ id: 'dsh-ops' }, row('panel')], /existing unified/],
    [[row('shell')], /unsupported OPS identity/],
    [[row('panel', { disabled: 'process.platform' })], /patch\[0\].disabled.*boolean/],
    [[row('panel', { config: { unexpected: 1 } })], /unexpected/],
    [[row('mode-standard', { config: { shellPolicy: 'advise' } })], /config.shellPolicy.*no equivalent/],
    [[row('mode-standard', { config: { publishBashTool: false, bash: true } })], /conflicts/],
    [[row('panel', { config: { enabled: false } })], /not an eight-row setting/],
    [[row('panel', { filter: 'custom' })], /patch\[0\].filter/],
    [[{ insert: [row('panel')], before: 'foreign' }], /positioning/],
    [[{ child: row('panel') }], /nested OPS/],
    [[{ remove: ['dsh-ops-panel'] }, row('tui')], /nested OPS/],
    [[row('panel', { name: 'dsh-ops/tui' })], /matching name/],
    [[row('compat', { config: { foo: true } })], /unsupported configuration keys: foo/],
    [[row('panel', { config: { textLimit: 1 } })], /textLimit/],
    [[], /no supported legacy/],
  ]) assert.throws(() => migrateProfile(input), message)
})
await test('JSON and YAML write only exclusive new review files; failures preserve input and output', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ops-migration-'))
  try {
    const input = path.join(dir, 'old.json'), output = path.join(dir, 'new.json')
    const original = JSON.stringify([row('panel', { config: { capture: false } })])
    writeFileSync(input, original)
    await assert.rejects(migrateFile(input, input), /different paths/)
    await migrateFile(input, output)
    assert.equal(readFileSync(input, 'utf8'), original)
    const migrated = readFileSync(output, 'utf8')
    await assert.rejects(migrateFile(input, output), /already exists/)
    assert.equal(readFileSync(output, 'utf8'), migrated)
    const link = path.join(dir, 'link.json'); symlinkSync(input, link)
    await assert.rejects(migrateFile(input, link), /already exists/)
    const yaml = path.join(dir, 'old.yml'), outYaml = path.join(dir, 'from-yaml.json')
    writeFileSync(yaml, '- id: dsh-ops-panel\n  disabled: true\n  config:\n    capture: false\n')
    await migrateFile(yaml, outYaml)
    assert.equal(JSON.parse(readFileSync(outYaml, 'utf8'))[0].config.panel.capture, false)
    writeFileSync(yaml, '- id: dsh-ops-panel\n  config:\n    capture: false\n    capture: true\n')
    const invalid = path.join(dir, 'invalid.json')
    await assert.rejects(migrateFile(yaml, invalid), /unique/)
    assert.equal(existsSync(invalid), false)
    writeFileSync(yaml, '- id: dsh-ops-panel\n  disabled: !custom true\n')
    await assert.rejects(migrateFile(yaml, invalid), /Unresolved tag/)
    assert.equal(existsSync(invalid), false)
    writeFileSync(yaml, '- &row {id: dsh-ops-panel}\n- *row\n')
    await assert.rejects(migrateFile(yaml, invalid), /alias/i)
    assert.equal(existsSync(invalid), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
report('fork-profile-migration')
