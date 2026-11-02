// Crash protection and error logging: what leaves the browser is cleaned; a crashing page shows the fallback and is
// logged once; the database keeps at most 30 errors per user per hour and nobody can read them from the app.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { isStaleBuild, redact } from '../src/lib/errorLog';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { api } from '../src/api';

describe('redact', () => {
  it('removes emails, tokens, keys, query values and codes', () => {
    const out = redact('Failed for asha.k@gmail.com with Bearer eyJhbGciOi.eyJzdWIi.sig1 at https://x.io/a?token=abc&x=1 key 5e373b577c16d6da7520956e0be89f6fef3f3245 code 123456 password=hunter2');
    expect(out).not.toMatch(/asha|eyJ|abc|5e373b5|123456|hunter2/);
    expect(out).toContain('<email>');
    expect(out).toContain('?token=<v>&x=<v>');
  });
  it('recognises a page of an older deployment', () => {
    expect(isStaleBuild(new TypeError('Failed to fetch dynamically imported module: /assets/Calendar-abc.js'))).toBe(true);
    expect(isStaleBuild(new Error('x is undefined'))).toBe(false);
  });
});

describe('ErrorBoundary', () => {
  afterEach(() => { document.body.innerHTML = '' });
  it('shows the fallback instead of a blank page and logs the cleaned error once', async () => {
    const log = vi.fn(() => Promise.resolve());
    (api as { logClientError?: typeof log }).logClientError = log;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => { throw new Error('Cannot read properties of undefined (reading "Title") for me@corp.com') };
    const el = document.createElement('div'); document.body.append(el);
    await act(async () => { createRoot(el).render(createElement(ErrorBoundary, { resetKey: 'ticket/TK-1' }, createElement(Broken))) });
    expect(el.textContent).toContain('Something went wrong here');
    expect(el.querySelector('button')?.textContent).toBe('Try again');
    expect(log).toHaveBeenCalledTimes(1);
    const sent = (log.mock.calls[0] as unknown as [{ message: string; where: string }])[0];
    expect(sent.where).toBe('page');
    expect(sent.message).toContain('<email>');
    expect(sent.message).not.toContain('me@corp.com');
  });
});
