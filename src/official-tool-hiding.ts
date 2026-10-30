/** Per-tool replacement through the host's scoped restriction and guard APIs.
 * Only explicit reviewed selections are masked. Missing selected counterparts
 * block the affected scope and restore its official tools until readiness returns.
 */
import type { Context } from './adapter/dsh/types.js'
import type { ToolGuard } from './adapter/dsh/types.js'
import type { OfficialReplacement } from './official-tool-catalog.js'
import { nativeProviders } from './publication/providers.js'
import { isPresentationProbe } from './publication/presentation.js'
import { resolveHidingConfig } from './config.js'
export { resolveHidingConfig } from './config.js'
import { OFFICIAL_REPLACEMENTS } from './official-tool-catalog.js'
import { safeDispose } from './teardown.js'
import { retired as retiredLegacyRow } from './settings/legacy.js'

interface Entry { context: Context; lifts: (() => void)[]; cleanupError?: string; collapsed?: boolean; error?: string; reported?: string }
interface Plan { deny: string[]; failure?: string }
const collapsed = (names: string[]): boolean => names.length > 0 && names.every(name => name === 'run_code')
// Newer hosts attach the wire tool array after the assembly waterfall.
// Only their nonempty PTC-only section proves a collapsed presentation then.
const collapsedAssembly = (assembly: { tools?: { name: string }[]; sections?: { name: string; text: string }[] }): boolean =>
  Array.isArray(assembly.tools) ? collapsed(assembly.tools.map(tool => tool.name))
    : Array.isArray(assembly.sections) && assembly.sections.some(section =>
      section.name === 'tools:ptc-only' && Boolean(section.text.trim()))
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

export const name = 'dsh-ops-hide-official'
const blocked = (detail: string): string => `READINESS_BLOCKED (EXECUTOR_UNAVAILABLE): dsh-ops hide-official cannot verify selected replacements: ${detail}. Restore the selected OPS tools, remove the selection from replaceTools, or disable the dsh-ops-hide-official row.`

export function apply(root: Context, raw?: unknown): void {
  if (retiredLegacyRow(root, 'hide-official')) return
  const { replaceTools }: { replaceTools: OfficialReplacement[] } = resolveHidingConfig(raw)
  // Empty and legacy-only rows install no hooks and cannot block a session.
  if (!replaceTools.length) return
  const selected = new Set<string>(replaceTools)
  const hideable = (tool: string): boolean => selected.has(tool)
  root.inject(['tools', 'systemPrompt'], ctx => {
    const entries = new Map<object, Entry>()
    let stopped = false, mutating = false
    let lastSurface: string | undefined
    const tools = ctx.get('tools')!
    const apiError = (['schemas', 'get', 'restrict', 'guard'] as const).filter(api => typeof tools[api] !== 'function')
    const fail = (message: string): void => ctx.logger?.error?.(message)
    const clear = (entry: Entry): boolean => {
      const pending = entry.lifts.splice(0)
      const failed = []
      for (const lift of pending) {
        if (!safeDispose(lift, error => fail(`dsh-ops: restriction cleanup failed: ${message(error)}`), 'official-tool restriction')) failed.push(lift)
      }
      entry.lifts.push(...failed)
      entry.cleanupError = failed.length > 0 ? 'host restriction cleanup failed; retrying before proceeding' : undefined
      return failed.length === 0
    }
    // Readiness examines the unmasked scope. It never accepts ops_<same-name>
    // as an equivalence claim, nor uses run_code as a native replacement.
    const readiness = (agent: object): boolean[] => {
      const owned = new Set(typeof tools.get === 'function' ? nativeProviders(ctx, agent).map(provider => provider.definition) : [])
      return replaceTools.map(tool => {
        const visible = typeof tools.get === 'function' ? tools.get(OFFICIAL_REPLACEMENTS[tool], agent) : undefined
        return visible !== undefined && owned.has(visible)
      })
    }
    const prepare = (agent: object, entry: Entry): Plan => {
      const names = typeof tools.schemas === 'function' ? tools.schemas(agent).map(schema => schema.name) : []
      const hidden = entry.collapsed ? [] : names.filter(hideable)
      const ready = readiness(agent)
      const missing = entry.collapsed ? [] : replaceTools.flatMap((tool, index) => {
        const replacement = OFFICIAL_REPLACEMENTS[tool]
        return names.includes(replacement) && ready[index]
          ? [] : [`${tool} -> ${replacement}`]
      })
      const diagnostics = [
        ...apiError.length ? [`missing host API: ${apiError.join(', ')}`] : [],
        ...entry.cleanupError ? [entry.cleanupError] : [],
        ...missing.length ? [`missing OPS surface: ${[...new Set(missing)].join(', ')}`] : [],
      ]
      const failure = diagnostics.length ? blocked(diagnostics.join('; ')) : undefined
      // A failed plan hides nothing: no partial mask over an unready scope.
      return { deny: failure ? [] : hidden, failure }
    }
    // Compare public surfaces before touching masks. Other components also
    // reconcile tools/change; emitting a fresh restriction for an unchanged
    // surface would otherwise cause a publication/withdrawal feedback loop.
    // Schema bytes alone cannot detect a foreign tool shadowing an OPS definition.
    const snapshot = (): string => JSON.stringify([tools.schemas(), ...[...entries.keys()].map(agent => [tools.schemas(agent), readiness(agent)])])
    const reconcile = () => {
      if (stopped || mutating) return
      try { if (snapshot() === lastSurface) return } catch { /* reported by per-agent verification below */ }
      mutating = true
      try {
        // Clear all masks first: inherited restrictions must not conceal a
        // parent's missing capability while checking a child.
        for (const entry of entries.values()) clear(entry)
        const plans: [object, Entry, Plan][] = []
        for (const [agent, entry] of entries) {
          let plan: Plan
          try { plan = prepare(agent, entry) }
          catch (error) { plan = { deny: [], failure: blocked(message(error)) } }
          plans.push([agent, entry, plan])
        }
        // Each scope owns its readiness and mask. A failed child is blocked at
        // assembly/dispatch; it does not make a healthy ancestor or root fail.
        for (const [agent, entry, plan] of plans) {
          if (plan.failure) { clear(entry); entry.error = plan.failure; continue }
          try {
            // One restriction per complete plan; never partially hide when a
            // single required replacement is absent.
            if (plan.deny.length) entry.lifts.push(entry.context.tools.restrict({ deny: plan.deny }))
            const leaked = entry.collapsed ? [] : tools.schemas(agent).map(schema => schema.name).filter(hideable)
            if (leaked.length) throw new Error(`host scoped restriction cannot hide own-scope tools: ${leaked.join(', ')}`)
            entry.error = undefined
          } catch (error) { clear(entry); entry.error = blocked(message(error)) }
        }
        for (const entry of entries.values()) {
          if (entry.error !== entry.reported) {
            if (entry.error) fail(entry.error)
            entry.reported = entry.error
          }
        }
        try { lastSurface = snapshot() } catch { lastSurface = undefined }
      } finally { mutating = false }
    }
    const block = (agent: object, detail: string): Error => {
      const message = blocked(detail)
      // Tool providers run before this waterfall, so keep the verified mask in
      // place for the next request's schema collection. Only this assembly
      // fails; invalidate readiness so transient provider errors are retryable.
      const entry = entries.get(agent)
      if (entry) entry.error = message
      lastSurface = undefined
      return new Error(message)
    }
    const attach = (agent: object): void => {
      if (entries.has(agent) || !('ctx' in agent) || !agent.ctx || typeof agent.ctx !== 'object') return
      entries.set(agent, { context: agent.ctx as Context, lifts: [], error: blocked('surface verification pending') })
      reconcile()
    }
    const refusal: ToolGuard = exec => {
      if (stopped) return blocked('component disposed')
      if (!exec?.agent?.ctx) return blocked('calling agent scope unavailable')
      attach(exec.agent)
      reconcile() // Authority is live, not a startup snapshot.
      const entry = entries.get(exec.agent)
      return entry?.error
        ?? (!entry?.collapsed && hideable(exec.name) ? blocked(`official tool ${exec.name} is selected for replacement`) : undefined)
    }
    ctx.on('tools/pre-execute', async (exec, next) => {
      const reason = refusal(exec)
      return reason ? { kind: 'deny', reason, info: { name: 'ReadinessError', code: 'READINESS_BLOCKED' } } : next()
    })
    if (typeof tools.guard === 'function') ctx.effect(() => ctx.tools.guard(refusal), 'dsh-ops: replacement surface guard')
    ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      // Only this package's exact, short-lived inspection context may pass before
      // discovery publishes a selected replacement. Provider requests stay guarded.
      if (!context.scope || isPresentationProbe(context)) return next()
      attach(context.scope)
      const entry = entries.get(context.scope)
      if (!entry) throw new Error(blocked('agent scope cannot be verified'))
      // The registry is presentation-agnostic. Only the assembled wire surface
      // can establish that selected tools are SDK calls, not Native duplicates.
      const wasMasked = entry.lifts.length > 0
      const ptcOnly = collapsedAssembly(assembly)
      if (Boolean(entry.collapsed) !== ptcOnly) {
        entry.collapsed = ptcOnly
        lastSurface = undefined
      }
      if (entry.cleanupError) lastSurface = undefined
      reconcile()
      // Providers collected SDK declarations before this hook. If a Native mask
      // was lifted, collect once more so the first PTC prompt includes those tools.
      let result
      try { result = ptcOnly && wasMasked && !entry.error ? await ctx.systemPrompt.assemble(context) : await next() }
      catch (error) { throw block(context.scope, `agent prompt assembly could not be verified: ${message(error)}`) }
      const names = Array.isArray(result?.tools) ? result.tools.map(schema => schema.name) : []
      if (entry.collapsed !== collapsedAssembly(result)) {
        entry.collapsed = collapsedAssembly(result)
        lastSurface = undefined
      }
      reconcile()
      if (entry.error) throw new Error(entry.error)
      const leaked = entry.collapsed ? [] : Array.isArray(result?.tools) ? names.filter(hideable)
        : replaceTools.filter(tool => tools.get(tool, context.scope) !== undefined)
      if (leaked.length) throw block(context.scope, `assembled surface still contains hidden official tools: ${leaked.join(', ')}`)
      return result
    })
    ctx.on('agent/created', ({ agent }) => { attach(agent); return undefined })
    ctx.on('agent/disposed', ({ agent }) => {
      const entry = entries.get(agent)
      if (!entry) return
      mutating = true
      try { clear(entry); entries.delete(agent) } finally { mutating = false }
      reconcile()
    })
    ctx.on('tools/change', () => {
      if (stopped || mutating) return
      // Presentation changes also emit this event. Never carry a PTC exemption
      // into a Native/both request; the next assembly verifies it anew.
      for (const entry of entries.values()) {
        if (entry.collapsed) { entry.collapsed = false; lastSurface = undefined }
      }
      reconcile()
    })
    ctx.effect(() => () => {
      stopped = true; mutating = true
      for (const entry of entries.values()) clear(entry)
      entries.clear()
    }, 'dsh-ops: selected official-tool restrictions')
    for (const agent of ctx.get('agents')?.list?.() ?? []) attach(agent)
    if (apiError.length) fail(blocked(`missing host API: ${apiError.join(', ')}`))
  })
}
