/** Typed access to the preload bridge. */
export const api = window.api

/** Extract a human-readable message from any thrown value. */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^Error:\s*/, '')
  if (typeof e === 'string') return e
  return 'Something went wrong'
}
