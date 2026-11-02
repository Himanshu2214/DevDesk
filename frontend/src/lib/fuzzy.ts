// Small fuzzy matcher for suggestion lists: "asha", "ash k", "akum" and "gmail" all find "Asha Kumar <asha.k@gmail.com>".
// Higher is better; null = no match.

/** score of one query word against one text: whole word > word start > anywhere > letters in order */
function wordScore(q: string, text: string): number | null {
  const i = text.indexOf(q);
  if (i >= 0) {
    const start = i === 0 || /[\s.@_\-+<]/.test(text[i - 1]);
    return (start ? 60 : 30) + (i === 0 ? 20 : 0) + q.length * 2 - i * 0.1;
  }
  // letters in order, with a penalty for gaps (e.g. "akr" in "asha kumar")
  let pos = -1, gaps = 0;
  for (const ch of q) {
    const next = text.indexOf(ch, pos + 1);
    if (next < 0) return null;
    gaps += next - pos - 1;
    pos = next;
  }
  return Math.max(1, 20 - gaps * 0.5);
}

export function fuzzyScore(query: string, text: string): number | null {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const t = text.toLowerCase();
  let total = 0;
  for (const w of words) {
    const s = wordScore(w, t);
    if (s === null) return null;
    total += s;
  }
  return total;
}

/** the best matches first; every word of the query must match somewhere. Loose "letters in order" matches only show
 *  when nothing contains the typed text itself ("asha" finds Asha, not rahul.sharma) */
export function fuzzyFilter<T>(items: T[], query: string, text: (x: T) => string, limit = 6): T[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean).length || 1;
  const hits = items.map(x => ({ x, s: fuzzyScore(query, text(x)) })).filter((r): r is { x: T; s: number } => r.s !== null);
  const strong = hits.filter(r => r.s >= 30 * words);
  return (strong.length ? strong : hits).sort((a, b) => b.s - a.s).slice(0, limit).map(r => r.x);
}
