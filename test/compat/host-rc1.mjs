/** Published DSH 0.2.2-rc.1 integration gate, against an actually installed OPS package.
 * Usage: DSH_OPS_WORKER_BIN=/absolute/worker node test/compat/host-rc1.mjs /host/prefix
 * The prefix must contain dsh-ops and the exact selected host graph. No fixture rewrites APIs.
 * host-rc2.mjs selects the separately built official rc.2 graph.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const hostVersion = process.env.DSH_OPS_TEST_HOST_VERSION ?? '0.2.2-rc.1'
assert.ok(['0.2.2-rc.1', '0.2.2-rc.2'].includes(hostVersion), 'an explicitly supported test host is required')
const prefix = path.resolve(process.argv[2] ?? '')
const require = createRequire(path.join(prefix, 'package.json'))
const load = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { createScope } = await load('@deepseek-ai/dsh-scope')
const boot = await load('@deepseek-ai/dsh-app-boot')
const { integration, diagnose } = await load('dsh-ops/integration')
const pkg = require('dsh-ops/package.json')
const worker = process.env.DSH_OPS_WORKER_BIN
assert.ok(worker && fs.existsSync(worker), 'an explicitly verified native worker is required')
assert.equal(boot.getDshRuntimeVersion(), hostVersion)
assert.equal(boot.evaluatePluginCompatibility(pkg), undefined)
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ops-rc1-')))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = root
const ctx = new Context(); ctx.logger.level = 0
let count = 0, identity = 0
const check = (name, fn) => Promise.resolve().then(fn).then(() => { count++; console.log('ok:', name) })
const until = async (fn) => {
  const deadline = Date.now() + 10000
  while (!fn()) { if (Date.now() > deadline) throw Error('publication did not settle'); await new Promise(r => setTimeout(r, 10)) }
}
const signal = () => new AbortController().signal
const call = async (agent, name, args, callSignal = signal()) => {
  const batch = await ctx.tools.execute({ agent, signal: callSignal, calls: [{ type: 'tool-call', id: `rc1-${++identity}`, name, arguments: JSON.stringify(args) }] })
  assert.equal(batch.results.length, 1)
  return batch.results[0].result
}
const names = agent => ctx.tools.definitions(agent).map(t => t.name)
const text = result => result.content.filter(x => x.type === 'text').map(x => x.text).join('\n')
try {
  for (const name of ['dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-subprocess-local', 'dsh-sandbox-local']) {
    await ctx.plugin((await load(`@deepseek-ai/${name}`)).default, {})
  }
  await ctx.plugin((await load('@deepseek-ai/dsh-fs-local')).default, { cwd: root })
  await ctx.plugin((await load('@deepseek-ai/dsh-working-directory')).default, { defaultDirectory: root })
  await ctx.plugin((await load('@deepseek-ai/dsh-sandbox-policy')).default, { mode: 'danger-full-access', workspaceRoot: root })
  await ctx.plugin((await load('@deepseek-ai/dsh-ptc-runtime-node')).default, {})
  const Native = await load('@deepseek-ai/dsh-tool-executor-native')
  const Ptc = await load('@deepseek-ai/dsh-tool-executor-ptc')
  await ctx.plugin(Native)
  const live = []; ctx.provide('agents', { list: () => [...live] })
  ctx.provide('agentPresets', { composedPreset: () => undefined })
  const { setSandboxMode } = await load('@deepseek-ai/dsh-sandbox-policy')
  async function agent(id, executor) {
    const session = ctx.sessions.create(id, { meta: { cwd: root, agentPreset: id } })
    setSandboxMode(session, 'danger-full-access')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    const item = { id, session }
    item.ctx = createScope(ctx, item).ctx
    item.executor = await item.ctx.plugin(executor)
    live.push(item)
    await ctx.serial('agent/created', { agent: item })
    return item
  }
  fs.writeFileSync(path.join(root, 'hello.txt'), 'rc1 native and PTC\nsecond line\n')
  let nativeRow = await ctx.plugin(integration({ preset: 'rc1-native', profile: 'native', binaryPath: worker, required: true, allowedTools: ['stat'] }))
  const native = await agent('rc1-native', Native)
  const ptcRow = await ctx.plugin(integration({ preset: 'rc1-ptc', profile: 'ptc', binaryPath: worker, required: true, alwaysLoaded: ['batch'], allowedTools: ['batch', 'stat'] }))
  const ptc = await agent('rc1-ptc', Ptc)
  await until(() => names(native).includes('ops_read_files') && names(ptc).includes('ops_batch'))
  await check('real batch executor runs native read and retains ordered results', async () => {
    const result = await call(native, 'ops_read_files', { files: [{ path: 'hello.txt' }] })
    assert.equal(result.isError, false, JSON.stringify(result))
    assert.match(text(result), /rc1 native and PTC/)
    const batch = await ctx.tools.execute({ agent: native, signal: signal(), calls: [
      { type: 'tool-call', id: 'first', name: 'ops_read_files', arguments: '{"files":[{"path":"hello.txt"}]}' },
      { type: 'tool-call', id: 'second', name: 'missing_tool', arguments: '{}' },
    ] })
    assert.deepEqual(batch.results.map(r => r.callId), ['first', 'second'])
    assert.equal(batch.results[0].result.isError, false)
    assert.equal(batch.results[1].result.isError, true)
  })
  await check('native discovery activates only after committed step and remains scoped', async () => {
    assert.equal(names(native).includes('ops_stat'), false)
    assert.deepEqual((await call(native, 'ops_discover_tools', { query: 'select:ops_stat' })).value.activated, ['ops_stat'])
    assert.equal(names(native).includes('ops_stat'), false)
    if (hostVersion === '0.2.2-rc.2') {
      native.session.append([['step/end', { turn: 1, step: 1 }], ['step/start', { turn: 1, step: 2 }]])
    } else native.session.append('step/end', { turn: 1, step: 1 })
    await until(() => names(native).includes('ops_stat'))
    assert.equal(names(ptc).includes('ops_stat'), false)
    assert.equal((await call(native, 'ops_stat', { path: 'hello.txt' })).isError, false)
  })
  await check('PTC has one run_code transport and executes typed nested OPS in real Node process', async () => {
    const presentation = await ctx.systemPrompt.assemble({ scope: ptc })
    assert.deepEqual(presentation.tools.map(t => t.name), ['run_code'])
    assert.ok(presentation.sections.some(s => s.name === 'tools:ptc-only' && s.text.trim()))
    const direct = await call(ptc, 'ops_batch', { action: 'plan', operations: [] })
    assert.equal(direct.isError, true)
    const nested = await call(ptc, 'run_code', { code: 'const r = await tools.ops_inspect_local_file({path:"hello.txt"}); return r;', description: 'Read test fixture' })
    assert.equal(nested.isError, false, JSON.stringify(nested))
    assert.match(text(nested), /rc1 native and PTC/)
    const batch = await call(ptc, 'run_code', { code: 'return await tools.ops_batch({action:"run",operations:[{op:"copy",path:"hello.txt",to:"copy.txt"}]});', description: 'Copy test fixture' })
    assert.equal(batch.isError, false, JSON.stringify(batch))
    assert.equal(fs.readFileSync(path.join(root, 'copy.txt'), 'utf8'), fs.readFileSync(path.join(root, 'hello.txt'), 'utf8'))
  })
  await check('PTC SDK loading and cancellation preserve host boundaries', async () => {
    const selected = await call(ptc, 'run_code', { code: 'return await tools.ops_load_sdk({tools:["stat"]});', description: 'Load stat SDK' })
    assert.equal(selected.isError, false, JSON.stringify(selected))
    assert.equal(names(ptc).includes('ops_stat'), false)
    ptc.session.append('step/end', { turn: 1, step: 1 })
    await until(() => names(ptc).includes('ops_stat'))
    const controller = new AbortController(); controller.abort()
    const result = await call(native, 'ops_read_files', { files: [{ path: 'hello.txt' }] }, controller.signal)
    assert.equal(result.isError, true)
    assert.match(result.error.info.code, /ABORTED/)
  })
  await check('executor unload fails closed and switching away revokes PTC publication', async () => {
    const stale = ctx.tools.get('ops_batch', ptc)
    await ptc.executor.dispose()
    await assert.rejects(call(ptc, 'run_code', { code: 'return 1', description: 'Probe unavailable executor' }), /executor is unavailable/)
    ptc.executor = await ptc.ctx.plugin(Native)
    await ctx.systemPrompt.assemble({ scope: ptc })
    await ctx.waterfall('agent/pre-step', { agent: ptc, signal: signal() }, async () => undefined)
    await until(() => !names(ptc).includes('ops_batch'))
    const result = await stale.execute({}, { agent: ptc, signal: signal() })
    assert.equal(result.status, 'rejected')
  })
  await check('native unload revokes callbacks and metadata is read by actual host', async () => {
    const stale = ctx.tools.get('ops_read_files', native)
    assert.equal((await diagnose(ctx, native)).state, 'ready')
    await nativeRow.dispose()
    await until(() => !names(native).includes('ops_read_files'))
    assert.equal((await stale.execute({ files: [] }, { agent: native, signal: signal() })).status, 'rejected')
    const metadata = boot.readPluginMeta('dsh-ops', pathToFileURL(path.join(prefix, 'probe.mjs')).href)
    assert.ok(metadata.title.zh && metadata.title.en)
    assert.match(metadata.icon, /^data:image\/png;base64,/)
  })
  await ptcRow.dispose()
  console.log(`DSH ${boot.getDshRuntimeVersion()} installed OPS ${pkg.version}: ${count} integration scenarios passed`)
} finally {
  await ctx.fiber.dispose()
  fs.rmSync(root, { recursive: true, force: true })
  if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome
}
