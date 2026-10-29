/** Assert archive modes directly: extraction/runtime checks must not repair them first. */
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { assert, test, report, withTempDir } from './lib/harness.mjs'
import { packDirectory } from '../scripts/lib/build/pack.js'
import { normalizePackedRuntimeModes, verifyPackedRuntimeModes } from '../scripts/lib/build/runtime-modes.js'
import { npm } from '../scripts/lib/build/util.js'

const targets = ['linux-x64', 'darwin-arm64', 'darwin-x64']
const names = targets.map(target => `package/runtime/${target}/dsh-ops-worker`)
function entries(file) {
  const bytes = gunzipSync(fs.readFileSync(file)), result = new Map()
  for (let offset = 0; bytes[offset];) {
    const h = bytes.subarray(offset, offset + 512)
    const name = h.subarray(0, 100).toString().split('\0')[0]
    const size = parseInt(h.subarray(124, 136).toString(), 8)
    result.set(name, { header: Buffer.from(h), mode: parseInt(h.subarray(100, 108).toString(), 8),
      body: Buffer.from(bytes.subarray(offset + 512, offset + 512 + size)) })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return result
}
function fixture(home) {
  const directory = path.join(home, 'package'), dist = path.join(home, 'dist')
  fs.mkdirSync(directory); fs.mkdirSync(dist)
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'dsh-ops', version: '0.0.0', files: ['runtime', 'note.txt'] }))
  fs.writeFileSync(path.join(directory, 'note.txt'), 'not executable\n')
  for (const target of targets) {
    const dir = path.join(directory, 'runtime', target); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'dsh-ops-worker'), `binary payload ${target}\0`, { mode: 0o644 })
    fs.chmodSync(path.join(dir, 'dsh-ops-worker'), 0o644)
  }
  return { directory, dist, file: path.join(dist, 'dsh-ops-0.0.0.tgz') }
}

await test('release packing preserves three Unix execute modes without changing payloads or other headers', () => withTempDir('packed-modes', async home => {
  const { directory, dist, file } = fixture(home)
  npm(['pack', '--ignore-scripts', '--pack-destination', dist, '--json'], { cwd: directory })
  const before = entries(file)
  for (const name of names) assert.equal(before.get(name).mode, 0o644)
  assert.throws(() => verifyPackedRuntimeModes(file), /not mode 0755/)
  const packed = await packDirectory(directory, dist)
  const after = entries(file)
  assert.deepEqual([...after.keys()], [...before.keys()])
  for (const [name, entry] of after) {
    assert.deepEqual(entry.body, before.get(name).body, `${name}: payload changed`)
    if (names.includes(name)) assert.equal(entry.mode, 0o755)
    else assert.deepEqual(entry.header, before.get(name).header, `${name}: unrelated metadata changed`)
  }
  assert.equal(packed.sha256, createHash('sha256').update(fs.readFileSync(file)).digest('hex'))
  assert.equal(packed.bytes, fs.statSync(file).size)
  verifyPackedRuntimeModes(file)
}))

await test('missing workers and invalid headers fail without replacing the original archive', () => withTempDir('packed-invalid', home => {
  const { directory, dist, file } = fixture(home)
  fs.unlinkSync(path.join(directory, 'runtime', targets[0], 'dsh-ops-worker'))
  npm(['pack', '--ignore-scripts', '--pack-destination', dist, '--json'], { cwd: directory })
  const original = fs.readFileSync(file)
  assert.throws(() => normalizePackedRuntimeModes(file), /Missing packed worker/)
  assert.deepEqual(fs.readFileSync(file), original)
  const corrupt = gunzipSync(original); corrupt[0] ^= 1
  fs.writeFileSync(file, gzipSync(corrupt))
  const damaged = fs.readFileSync(file)
  assert.throws(() => normalizePackedRuntimeModes(file), /Invalid npm tar header/)
  assert.deepEqual(fs.readFileSync(file), damaged)
}))
report('package-runtime-modes')
