import { createScope } from '@deepseek-ai/dsh-scope'
import { visibleToolNames } from '../lib/tool-visibility.js'
import { legacyComponent } from './lib/legacy-component.mjs'
import { applyComponent } from '../lib/index.js'
import { assert, report, test } from './lib/harness.mjs'
import { bootHost, shutdown } from './lib/host.mjs'

const tool = name => ({ name, description: name, parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async () => name })

await test('known-name queries never request schemas or private registry views', () => {
  const scope = {}, queried = []
  const tools = { get(name, actualScope) { assert.equal(actualScope, scope); queried.push(name); return name === 'kept' ? {} : undefined },
    schemas() { throw Error('must not deep-copy schemas') }, view() { throw Error('must not use private view') } }
  assert.deepEqual(visibleToolNames(tools, ['kept', 'absent'], scope), ['kept'])
  assert.deepEqual(queried, ['kept', 'absent'])
  assert.deepEqual(visibleToolNames(undefined, ['kept'], scope), [])
})

await test('public lookups preserve live restrictions, scoped shadowing and restoration', async () => {
  const { ctx } = await bootHost()
  try {
    ctx.tools.register(tool('read'))
    ctx.tools.register(tool('grep'))
    const agent = { id: 'visibility' }
    await ctx.plugin({ inject: ['tools'], apply(inner) { agent.ctx = createScope(inner, agent).ctx } })
    const names = ['read', 'grep', 'missing']
    assert.deepEqual(visibleToolNames(ctx.tools, names, agent), ['read', 'grep'])
    const restore = agent.ctx.tools.restrict({ deny: ['read'] })
    assert.deepEqual(visibleToolNames(ctx.tools, names, agent), ['grep'])
    const unshadow = agent.ctx.tools.register(tool('read'))
    assert.deepEqual(visibleToolNames(ctx.tools, names, agent), ['read', 'grep'])
    unshadow()
    assert.deepEqual(visibleToolNames(ctx.tools, names, agent), ['grep'])
    restore()
    assert.deepEqual(visibleToolNames(ctx.tools, names, agent), ['read', 'grep'])
  } finally { await shutdown(ctx) }
})

await test('shell publication and denial inspect only their known tool names (#369)', async () => {
  const { ctx, tools } = await bootHost()
  try {
    tools.register(tool('bash'))
    const agent = { id: 'shell-visibility', session: { header: { cwd: process.cwd() } } }
    await ctx.plugin({ inject: ['tools'], apply(inner) { agent.ctx = createScope(inner, agent).ctx } })
    ctx.provide('agents', { list: () => [agent] })
    let schemasRead = 0
    const original = tools.schemas
    tools.schemas = function (...args) { schemasRead++; return original.apply(this, args) }
    await ctx.plugin(legacyComponent({ apply(inner) { applyComponent(inner, { publishBashTool: false, shellPolicy: 'deny-host-shell', deniedHostTools: ['bash'], configUpdateVersion: 2 }, 'shell') } }))
    assert.equal(schemasRead, 0, 'mount must not clone the complete tool schema surface')
    assert.equal(tools.get('bash', agent), undefined, 'denied host tool remains restricted')
    schemasRead = 0
    const assembly = await ctx.systemPrompt.assemble({ scope: agent })
    assert.ok(Array.isArray(assembly.tools))
    // The host owns wire projection; the plugin section must not request schemas.
    assert.equal(schemasRead, 0)
  } finally { await shutdown(ctx) }
})

report('tool-visibility')
