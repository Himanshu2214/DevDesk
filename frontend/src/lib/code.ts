// Code display: Shiki syntax highlighting (ABAP included) and Mermaid diagrams. Both libraries load only when a page
// shows code, with the JavaScript regex engine (no WebAssembly) – so they work in the SAP build too. If anything fails,
// the plain text stays as it is.
import type { HighlighterCore } from 'shiki/core';

/** language names and aliases people type after ``` (or in Knowledge → Language) → Shiki grammar */
const LANG: Record<string, string> = {
  abap: 'abap', cds: 'abap', json: 'json', sql: 'sql', xml: 'xml', html: 'html', css: 'css', yaml: 'yaml', yml: 'yaml',
  js: 'javascript', javascript: 'javascript', ts: 'typescript', typescript: 'typescript', sh: 'shellscript', bash: 'shellscript',
  shell: 'shellscript', powershell: 'shellscript', md: 'markdown', markdown: 'markdown',
};
const MERMAID_START = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|xychart-beta|block-beta)\b/;

export const isMermaid = (lang: string, text: string) => lang.toLowerCase() === 'mermaid' || MERMAID_START.test(text);
export const grammarOf = (lang: string) => LANG[lang.trim().toLowerCase()] ?? '';

let highlighter: Promise<HighlighterCore> | null = null;
function loadHighlighter() {
  return (highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([import('shiki/core'), import('shiki/engine/javascript')]);
    return createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark-default'), import('@shikijs/themes/github-light-default')],
      langs: [import('@shikijs/langs/abap'), import('@shikijs/langs/json'), import('@shikijs/langs/sql'), import('@shikijs/langs/xml'),
        import('@shikijs/langs/html'), import('@shikijs/langs/css'), import('@shikijs/langs/yaml'),
        import('@shikijs/langs/javascript'), import('@shikijs/langs/typescript'), import('@shikijs/langs/shellscript'), import('@shikijs/langs/markdown')],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })().catch(e => { highlighter = null; throw e }));
}

/** Highlighted HTML (both themes as CSS variables, switched by the app theme), or null when the language is unknown */
export async function highlight(code: string, lang: string): Promise<string | null> {
  const g = grammarOf(lang);
  if (!g) return null;
  const h = await loadHighlighter();
  return h.codeToHtml(code, { lang: g, themes: { dark: 'github-dark-default', light: 'github-light-default' }, defaultColor: false });
}

let mermaidLib: Promise<typeof import('mermaid')['default']> | null = null;
let seq = 0;
/** Mermaid diagram as SVG (strict security level: no scripts, no HTML labels) */
export async function mermaidSvg(text: string): Promise<string> {
  const mermaid = await (mermaidLib ??= import('mermaid').then(m => m.default).catch(e => { mermaidLib = null; throw e }));
  const dark = document.documentElement.dataset.theme !== 'light';
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'Poppins, Segoe UI, sans-serif' });
  const { svg } = await mermaid.render('mmd-' + ++seq, text);
  return svg;
}

/** Upgrades every <pre><code> inside a container: diagrams for Mermaid, colours for known languages */
export async function enhanceCode(root: HTMLElement) {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code')].filter(c => !c.closest('[data-code-done]'));
  for (const codeEl of blocks) {
    const pre = codeEl.parentElement!;
    pre.dataset.codeDone = '1';
    const lang = (codeEl.className.match(/language-([\w+-]+)/)?.[1] ?? '').toLowerCase();
    const text = codeEl.textContent ?? '';
    try {
      if (isMermaid(lang, text)) {
        const box = document.createElement('div');
        box.className = 'mmd';
        box.dataset.codeDone = '1';
        box.innerHTML = await mermaidSvg(text);
        pre.replaceWith(box);
      } else if (grammarOf(lang)) {
        const html = await highlight(text, lang);
        if (html) { const tmp = document.createElement('div'); tmp.innerHTML = html; const out = tmp.firstElementChild as HTMLElement; out.dataset.codeDone = '1'; out.dataset.lang = lang; pre.replaceWith(out) }
      }
    } catch { /* keep the plain text */ }
  }
}
