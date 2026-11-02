// A phone that approves sign-ins keeps its own sign-in: keepSignedIn() turns on "remember me" and moves the session
// from sessionStorage (lost when the app is closed) to localStorage.
import { expect, it } from 'vitest';
import { getRemember, keepSignedIn, setRemember } from '../src/lib/supabase';

it('moves the session to lasting storage and remembers the choice', () => {
  setRemember(false);
  sessionStorage.setItem('sb-abc-auth-token', '{"access_token":"x"}');
  sessionStorage.setItem('other', 'stays');
  keepSignedIn();
  expect(getRemember()).toBe(true);
  expect(localStorage.getItem('sb-abc-auth-token')).toBe('{"access_token":"x"}');
  expect(sessionStorage.getItem('sb-abc-auth-token')).toBeNull();
  expect(sessionStorage.getItem('other')).toBe('stays');
});
