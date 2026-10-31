// Read view of a code field: Shiki colours for known languages (ABAP, JSON, SQL, …), a diagram for Mermaid,
// plain monospace otherwise. Falls back to plain text while loading or if the libraries cannot load.
import { useEffect, useState } from 'react';
import { grammarOf, highlight, isMermaid, mermaidSvg } from '../lib/code';

export function CodeView({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [kind, setKind] = useState<'code' | 'mmd'>('code');
  const [theme, setTheme] = useState(0);
  useEffect(() => { const on = () => setTheme(t => t + 1); addEventListener('devdesk-theme', on); return () => removeEventListener('devdesk-theme', on) }, []);
  useEffect(() => {
    let live = true;
    setHtml(null);
    const job = isMermaid(lang, code) ? mermaidSvg(code).then(svg => { if (live) { setKind('mmd'); setHtml(svg) } })
      : grammarOf(lang) ? highlight(code, lang).then(h => { if (live && h) { setKind('code'); setHtml(h) } }) : null;
    job?.catch(() => { /* plain text stays */ });
    return () => { live = false };
  }, [code, lang, theme]);
  if (html) return <div className={kind === 'mmd' ? 'mmd' : 'code-view'} dangerouslySetInnerHTML={{ __html: html }} />;
  return <pre className="code-view code-plain">{code}</pre>;
}

/** ```mermaid … ``` blocks inside a plain-text field */
export const mermaidBlocks = (text: string) => [...text.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map(m => m[1].trim()).filter(Boolean);
