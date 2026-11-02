import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyScore } from '../src/lib/fuzzy';

const people = [
  { name: 'Asha Kumar', email: 'asha.k@gmail.com' },
  { name: 'Max Member', email: 'max@company.com' },
  { name: '', email: 'rahul.sharma@outlook.com' },
];
const text = (p: typeof people[number]) => `${p.name} ${p.email}`;

describe('fuzzy search', () => {
  it('finds by name, email, word starts and letters in order', () => {
    expect(fuzzyFilter(people, 'asha', text).map(p => p.email)).toEqual(['asha.k@gmail.com']);
    expect(fuzzyFilter(people, 'ash k', text)[0].email).toBe('asha.k@gmail.com');
    expect(fuzzyFilter(people, 'akum', text)[0].email).toBe('asha.k@gmail.com');
    expect(fuzzyFilter(people, 'sharma', text)[0].email).toBe('rahul.sharma@outlook.com');
    expect(fuzzyFilter(people, 'company', text).map(p => p.name)).toEqual(['Max Member']);
  });
  it('ranks a word start above a match inside a word, and drops non-matches', () => {
    expect(fuzzyScore('ma', 'max member')!).toBeGreaterThan(fuzzyScore('ma', 'rahul sharma')!);
    expect(fuzzyFilter(people, 'zzz', text)).toEqual([]);
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});
