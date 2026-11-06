// "Share → SLATE·SPACE" in the Android app: text shared from another app (an email, a chat message, a web page) opens
// the New ticket dialog with it. The native side is ShareIntentPlugin.java. Loaded only inside the app.
import { registerPlugin } from '@capacitor/core';
import type { NewTicket } from '../api';

export interface Shared { text?: string; subject?: string }
interface ShareIntentPlugin {
  getShared(): Promise<Shared>;
  addListener(event: 'shared', cb: (s: Shared) => void): Promise<{ remove(): Promise<void> }>;
}
const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');

const URL_RE = /https?:\/\/[^\s<>"]+/i;
const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;

/** subject → title (else the first line of the text); the text → description; a link in it → reference */
export function sharedToTicket(s: Shared): Partial<NewTicket> | null {
  const text = (s.text ?? '').replace(/\r\n/g, '\n').trim(), subject = (s.subject ?? '').trim();
  if (!text && !subject) return null;
  const link = text.match(URL_RE)?.[0] ?? '';
  const onlyLink = !!link && text === link;
  const firstLine = text.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const title = clip(subject || (onlyLink ? link.replace(/^https?:\/\/(www\.)?/, '') : firstLine), 120);
  const description = onlyLink || text === title ? '' : text;
  return { Title: title, ...(description ? { Description: description } : {}), ...(link ? { Reference: clip(link, 300) } : {}) };
}

/** the share that started the app, then every later one */
export async function listenForShares(open: (pre: Partial<NewTicket>) => void) {
  const first = sharedToTicket(await ShareIntent.getShared());
  if (first) open(first);
  await ShareIntent.addListener('shared', s => { const pre = sharedToTicket(s); if (pre) open(pre) });
}
