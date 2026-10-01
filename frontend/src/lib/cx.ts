/** className joiner. Plain module (no 'use client') so server components can use it too. */
export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}
