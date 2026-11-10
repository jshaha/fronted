import { describe, it, expect } from 'vitest';
import { checkPortalUrl, assertPortalUrl, PortalUrlNotAllowedError } from '@/lib/portal/allowlist';

describe('portal allowlist', () => {
  const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000'];

  describe('checkPortalUrl', () => {
    describe('allowed URLs', () => {
      it('allows http://localhost:3000/mock-portal', () => {
        const result = checkPortalUrl('http://localhost:3000/mock-portal', allowed);
        expect(result.ok).toBe(true);
      });

      it('allows http://localhost:3000/mock-portal?v=2', () => {
        const result = checkPortalUrl('http://localhost:3000/mock-portal?v=2', allowed);
        expect(result.ok).toBe(true);
      });

      it('allows http://localhost:3000/mock-portal/submissions', () => {
        const result = checkPortalUrl('http://localhost:3000/mock-portal/submissions', allowed);
        expect(result.ok).toBe(true);
      });

      it('allows http://127.0.0.1:3000/mock-portal', () => {
        const result = checkPortalUrl('http://127.0.0.1:3000/mock-portal', allowed);
        expect(result.ok).toBe(true);
      });

      it('allows IPv6 localhost [::1]', () => {
        const result = checkPortalUrl('http://[::1]:3000/mock-portal', allowed.concat('http://[::1]:3000'));
        expect(result.ok).toBe(true);
      });
    });

    describe('rejected URLs', () => {
      it('rejects real university URL', () => {
        const result = checkPortalUrl('https://callink.berkeley.edu/events', allowed);
        expect(result.ok).toBe(false);
        expect((result as { reason?: string }).reason).toContain('not in allowlist');
      });

      it('rejects wrong port', () => {
        const result = checkPortalUrl('http://localhost:3001/mock-portal', allowed);
        expect(result.ok).toBe(false);
        expect((result as { reason?: string }).reason).toContain('not in allowlist');
      });

      it('rejects wrong path', () => {
        const result = checkPortalUrl('http://localhost:3000/simulator', allowed);
        expect(result.ok).toBe(false);
        expect((result as { reason?: string }).reason).toContain('path');
      });

      it('rejects path that is prefix of /mock-portal', () => {
        const result = checkPortalUrl('http://localhost:3000/mock-portalx', allowed);
        expect(result.ok).toBe(false);
      });

      it('rejects file:// protocol', () => {
        const result = checkPortalUrl('file:///etc/passwd', allowed);
        expect(result.ok).toBe(false);
        expect((result as { reason?: string }).reason).toContain('protocol');
      });

      it('rejects javascript: protocol', () => {
        const result = checkPortalUrl('javascript:alert(1)', allowed);
        expect(result.ok).toBe(false);
      });

      it('rejects URL with credentials', () => {
        const result = checkPortalUrl('http://user:pw@localhost:3000/mock-portal', allowed);
        expect(result.ok).toBe(false);
        expect((result as { reason?: string }).reason).toContain('credentials');
      });

      it('rejects non-URL string', () => {
        const result = checkPortalUrl('not a url', allowed);
        expect(result.ok).toBe(false);
        expect((result as { reason?: string }).reason).toContain('not a URL');
      });

      it('rejects evil.com even if in allowlist at the origin level', () => {
        const result = checkPortalUrl('http://evil.com/mock-portal', ['http://evil.com']);
        expect(result.ok).toBe(false);
        // Only localhost origins allowed
        expect((result as { reason?: string }).reason).toContain('only the local mock portal is allowed');
      });

      it('rejects localhost.evil.com even on allowed port', () => {
        const result = checkPortalUrl('http://localhost.evil.com:3000/mock-portal', allowed);
        expect(result.ok).toBe(false);
        // Rejected by the origin allowlist before the localhost-only check.
        expect((result as { reason?: string }).reason).toContain('not in allowlist');
      });
    });

    describe('path validation', () => {
      it('rejects /mock-portal alone without trailing slash or subpath', () => {
        // Actually, /mock-portal should be allowed as-is
        const result = checkPortalUrl('http://localhost:3000/mock-portal', allowed);
        expect(result.ok).toBe(true);
      });

      it('allows /mock-portal/ with trailing slash', () => {
        const result = checkPortalUrl('http://localhost:3000/mock-portal/', allowed);
        expect(result.ok).toBe(true);
      });

      it('allows any subpath under /mock-portal/', () => {
        const result = checkPortalUrl('http://localhost:3000/mock-portal/any/deep/path', allowed);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('assertPortalUrl', () => {
    it('does not throw for allowed URL', () => {
      expect(() => assertPortalUrl('http://localhost:3000/mock-portal', allowed)).not.toThrow();
    });

    it('throws PortalUrlNotAllowedError for disallowed URL', () => {
      expect(() => assertPortalUrl('https://evil.com/mock-portal', allowed)).toThrow(PortalUrlNotAllowedError);
    });

    it('throws error with the URL and reason', () => {
      const url = 'https://evil.com/mock-portal';
      try {
        assertPortalUrl(url, allowed);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PortalUrlNotAllowedError);
        if (err instanceof PortalUrlNotAllowedError) {
          expect(err.url).toBe(url);
          expect(err.reason).toBeDefined();
          expect(err.message).toContain(url);
        }
      }
    });
  });
});
