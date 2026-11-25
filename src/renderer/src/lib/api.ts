/** Typed access to the preload bridge. */
export const api = window.api

/** Extract a human-readable message from any thrown value. Errors thrown in the
 *  main process arrive as "Error invoking remote method 'x': Error: <message>". */
export function errMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const msg = raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(?:\w*Error:\s*)+/, '')
  return msg.trim() || 'Something went wrong'
}
