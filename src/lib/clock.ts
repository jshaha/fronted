/** Overridable clock so tests and the expiry sweeper can control time. */
const g = globalThis as unknown as { __frontedNow?: () => Date };

export function now(): Date {
  return g.__frontedNow ? g.__frontedNow() : new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export function setClock(fn: (() => Date) | undefined): void {
  g.__frontedNow = fn;
}
