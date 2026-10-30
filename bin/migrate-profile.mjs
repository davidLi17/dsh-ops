#!/usr/bin/env node
/** Offline eight-row patch migration. Never discovers or edits an active profile. */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveMergedConfig } from '../lib/settings/merged.js'

const sections = ['minimal', 'standard', 'ptc', 'cordis', 'discovery', 'compat', 'panel', 'tui']
const rows = new Map(sections.map(section => {
  const suffix = sections.indexOf(section) < 4 ? `mode-${section}` : section
  return [`dsh-ops-${suffix}`, { section, name: `dsh-ops/${suffix}` }]
}))
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (object, key) => Object.hasOwn(object, key)
function fail(location, reason) { throw new Error(`${location}: ${reason}`) }
function opsIdentity(row) {
  return isObject(row) && [row.id, row.name].some(value => typeof value === 'string'
    && (value === 'dsh-ops' || value.startsWith('dsh-ops/') || value.startsWith('dsh-ops-')))
}
function nestedOps(value) {
  if (typeof value === 'string') return value === 'dsh-ops' || value.startsWith('dsh-ops/') || value.startsWith('dsh-ops-')
  if (!value || typeof value !== 'object') return false
  return opsIdentity(value) || Object.values(value).some(nestedOps)
}

/** Convert a profile patch array; unrelated operations retain their data and order. */
export function migrateProfile(input) {
  if (!Array.isArray(input)) fail('profile', 'expected a JSON/YAML patch array, not a composed profile object')
  const seen = new Set(), config = {}, output = []
  function consume(row, location, inserted = false) {
    if (!opsIdentity(row)) return false
    if (row.id === 'dsh-ops' || row.name === 'dsh-ops') fail(location, 'existing unified dsh-ops row; refusing to overwrite or combine it')
    const known = rows.get(row.id)
    if (!known || (own(row, 'name') && row.name !== known.name)) {
      fail(location, `unsupported OPS identity ${JSON.stringify({ id: row.id, name: row.name })}; expected a stable eight-row id and its matching name`)
    }
    if (seen.has(row.id)) fail(location, `duplicate ${row.id}; resolve patch precedence manually`)
    seen.add(row.id)
    for (const key of Object.keys(row)) if (!['id', 'name', 'disabled', 'config'].includes(key)) {
      fail(`${location}.${key}`, 'unsupported row override; migrate this operation manually')
    }
    if (own(row, 'disabled') && typeof row.disabled !== 'boolean') fail(`${location}.disabled`, 'expected boolean; expressions cannot be migrated offline')
    if (own(row, 'config') && !isObject(row.config)) fail(`${location}.config`, 'expected an object')
    const saved = structuredClone(row.config ?? {})
    const { section } = known
    const disabledDefault = !inserted && ['compat', 'panel', 'tui'].includes(section)
    const enabled = !(row.disabled ?? disabledDefault)
    if (section === 'compat') {
      if (Object.keys(saved).length) fail(`${location}.config`, `compat has unsupported configuration keys: ${Object.keys(saved).join(', ')}`)
      if (enabled) config.global = { hideOfficialTools: false, hidePwsh: false }
      return true
    }
    for (const key of ['serverName', 'enableShellTools', 'toolCallTimeoutMs', 'shellPolicy', 'deniedHostTools', 'configUpdateVersion']) {
      if (own(saved, key)) fail(`${location}.config.${key}`, 'legacy-only override has no equivalent; review and remove it from a copy before migrating')
    }
    if (own(saved, 'enabled') && section !== 'discovery') fail(`${location}.config.enabled`, 'not an eight-row setting; resolve this override manually')
    if (section === 'discovery' && own(saved, 'enabled') && typeof saved.enabled !== 'boolean') fail(`${location}.config.enabled`, 'expected boolean')
    // The merged runtime supplies bash explicitly, so carry the legacy alias into it.
    if (own(saved, 'publishBashTool')) {
      if (own(saved, 'bash') && saved.bash !== saved.publishBashTool) fail(`${location}.config.bash`, 'conflicts with publishBashTool')
      saved.bash = saved.publishBashTool
    }
    const sectionEnabled = enabled && (section !== 'discovery' || saved.enabled !== false)
    config[section] = { ...saved, enabled: sectionEnabled }
    try { resolveMergedConfig({ [section]: config[section] }) }
    catch (error) { fail(`${location}.config`, error.message) }
    return true
  }
  input.forEach((entry, index) => {
    const location = `patch[${index}]`
    if (!isObject(entry)) fail(location, 'expected a patch object')
    if (consume(entry, location)) return
    if (Array.isArray(entry.insert) && entry.insert.some(nestedOps)) {
      if (Object.keys(entry).some(key => key !== 'insert')) fail(location, 'OPS insert with positioning or other operations is unsupported; resolve manually')
      const retained = entry.insert.filter((row, i) => {
        if (consume(row, `${location}.insert[${i}]`, true)) return false
        if (nestedOps(row)) fail(`${location}.insert[${i}]`, 'nested OPS operation is unsupported')
        return true
      })
      if (retained.length) output.push({ insert: structuredClone(retained) })
      return
    }
    if (nestedOps(entry)) fail(location, 'nested OPS operation is unsupported')
    output.push(structuredClone(entry))
  })
  if (!seen.size) fail('profile', 'no supported legacy OPS rows found; no output written')
  resolveMergedConfig(config)
  output.push({ id: 'dsh-ops', name: 'dsh-ops', config })
  return output
}

export async function migrateFile(inputPath, outputPath) {
  if (path.resolve(inputPath) === path.resolve(outputPath)) throw new Error('input and output must be different paths')
  // Exclusive creation below also rejects symlinks, hardlinks and races with other writers.
  if (fs.existsSync(outputPath)) throw new Error('output already exists; choose a new path')
  const source = fs.readFileSync(inputPath, 'utf8')
  let input
  if (/\.ya?ml$/i.test(inputPath)) {
    let YAML
    try { YAML = await import('yaml') }
    catch { throw new Error('YAML input requires the checkout dependencies: run npm ci --ignore-scripts, or supply JSON') }
    const document = YAML.parseDocument(source, { uniqueKeys: true })
    if (document.errors.length || document.warnings.length) {
      throw new Error([...document.errors, ...document.warnings].map(issue => issue.message).join('; '))
    }
    input = document.toJS({ maxAliasCount: 0 })
  } else input = JSON.parse(source)
  const output = migrateProfile(input)
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('usage: node bin/migrate-profile.mjs INPUT.json|INPUT.yml NEW-OUTPUT.json')
    await migrateFile(process.argv[2], process.argv[3])
    console.log(`Wrote a review copy to ${process.argv[3]}. Original unchanged; no active profile was updated.`)
  } catch (error) { console.error(`Migration refused: ${error.message}`); process.exitCode = 1 }
}
