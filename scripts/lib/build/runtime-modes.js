/** Keep POSIX worker modes in npm archives even when assembled on Windows. */
import fs from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'

const WORKERS = new Set(['linux-x64', 'darwin-arm64', 'darwin-x64']
  .map(target => `package/runtime/${target}/dsh-ops-worker`))
const text = bytes => bytes.toString('utf8').replace(/\0.*$/su, '')
function octal(bytes) {
  const value = text(bytes).trim()
  if (!/^[0-7]+$/u.test(value)) throw new Error('Invalid npm tar numeric field')
  return Number.parseInt(value, 8)
}
function checksum(header) {
  return header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)
}

/** Parse npm's generated ustar headers; never extract or modify member payloads. */
function workerHeaders(bytes) {
  const workers = new Map()
  let offset = 0
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) {
      if (!bytes.subarray(offset).every(byte => byte === 0)) throw new Error('Unexpected data after npm tar terminator')
      for (const name of WORKERS) if (!workers.has(name)) throw new Error(`Missing packed worker: ${name}`)
      return workers
    }
    if (text(header.subarray(257, 263)) !== 'ustar' || octal(header.subarray(148, 156)) !== checksum(header)) {
      throw new Error('Invalid npm tar header or checksum')
    }
    const prefix = text(header.subarray(345, 500))
    const name = (prefix ? `${prefix}/` : '') + text(header.subarray(0, 100))
    const size = octal(header.subarray(124, 136))
    const next = offset + 512 + Math.ceil(size / 512) * 512
    if (!Number.isSafeInteger(next) || next > bytes.length) throw new Error('Truncated npm tar member')
    if (WORKERS.has(name)) {
      if (workers.has(name) || ![0, 48].includes(header[156])) throw new Error(`Invalid packed worker: ${name}`)
      workers.set(name, header)
    }
    offset = next
  }
  throw new Error('Missing npm tar terminator')
}

/** Only the three bundled Unix executables get 0755; all content bytes stay intact. */
export function normalizePackedRuntimeModes(file) {
  const bytes = gunzipSync(fs.readFileSync(file))
  const workers = workerHeaders(bytes)
  for (const header of workers.values()) {
    header.write('0000755\0', 100, 8, 'ascii')
    header.fill(32, 148, 156)
    header.write(checksum(header).toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
  }
  fs.writeFileSync(file, gzipSync(bytes, { level: 9 }))
  verifyPackedRuntimeModes(file)
}

/** Read-only archive check, before any extraction or runtime checker can chmod files. */
export function verifyPackedRuntimeModes(file) {
  const workers = workerHeaders(gunzipSync(fs.readFileSync(file)))
  for (const [name, header] of workers) {
    if (octal(header.subarray(100, 108)) !== 0o755) throw new Error(`Packed worker is not mode 0755: ${name}`)
  }
}
