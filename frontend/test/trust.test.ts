// "Trusted for 24 hours": the browser keeps the token per account; another account, an expired or rejected token
// falls back to the code (and is forgotten). Plus the database side: only the server can touch the tokens.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../src/lib/supabase', () => ({ sb: () => ({ functions: { invoke } }) }));
const { applyTrust, clearTrust, saveTrust, trustToken } = await import('../src/lib/trust');

const later = new Date(Date.now() + 3600_000).toISOString(), earlier = new Date(Date.now() - 1000).toISOString();

describe('trusted browser', () => {
  beforeEach(() => { localStorage.clear(); invoke.mockReset() });

  it('uses the token for the same account', async () => {
    saveTrust('u1', { trust: 'tok', trustExpiresAt: later });
    invoke.mockResolvedValue({ data: { verified: true }, error: null });
    expect(await applyTrust('u1')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('verify-login-code', { body: { trust: 'tok' } });
  });

  it('asks for a code for another account, without sending the token', async () => {
    saveTrust('u1', { trust: 'tok', trustExpiresAt: later });
    expect(await applyTrust('u2')).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('forgets an expired or rejected token', async () => {
    saveTrust('u1', { trust: 'old', trustExpiresAt: earlier });
    expect(await applyTrust('u1')).toBe(false);
    expect(trustToken()).toBeNull();
    saveTrust('u1', { trust: 'revoked', trustExpiresAt: later });
    invoke.mockResolvedValue({ data: null, error: new Error('404') });
    expect(await applyTrust('u1')).toBe(false);
    expect(trustToken()).toBeNull();
  });

  it('keeps nothing when the server gave no token (migration not run yet)', () => {
    saveTrust('u1', {});
    expect(trustToken()).toBeNull();
    clearTrust();
  });
});
