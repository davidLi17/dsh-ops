/** Query a bounded set of names through the public, scope-aware host API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export function visibleToolNames(
  tools: Pick<Context['tools'], 'get'> | undefined,
  names: Iterable<string>,
  scope?: Parameters<Context['tools']['get']>[1],
): string[] {
  return [...names].filter(name => tools?.get(name, scope) !== undefined)
}
