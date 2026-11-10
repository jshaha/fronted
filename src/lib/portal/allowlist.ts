/**
 * The browser agent may only ever be on the local mock portal.
 * Checked before navigation and after every executed step.
 */
export class PortalUrlNotAllowedError extends Error {
  constructor(public url: string, public reason: string) {
    super(`Portal URL not allowed (${reason}): ${url}`);
    this.name = 'PortalUrlNotAllowedError';
  }
}

export function checkPortalUrl(url: string, allowedOrigins: string[]): { ok: true } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: 'not a URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: `protocol ${u.protocol}` };
  if (u.username || u.password) return { ok: false, reason: 'credentials in URL' };
  const allowed = allowedOrigins.map((o) => {
    try {
      return new URL(o).origin;
    } catch {
      return null;
    }
  });
  if (!allowed.includes(u.origin)) return { ok: false, reason: `origin ${u.origin} not in allowlist` };
  const host = u.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return { ok: false, reason: 'only the local mock portal is allowed' };
  if (!(u.pathname === '/mock-portal' || u.pathname.startsWith('/mock-portal/'))) return { ok: false, reason: `path ${u.pathname}` };
  return { ok: true };
}

export function assertPortalUrl(url: string, allowedOrigins: string[]): void {
  const r = checkPortalUrl(url, allowedOrigins);
  if (!r.ok) throw new PortalUrlNotAllowedError(url, r.reason);
}
