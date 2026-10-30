// Your avatar: the Google photo, plain initials, or one of the colour avatars. Standalone mode keeps the choice in the
// account (follows you to every device); SAP and sample-data mode keep it in this browser.
import { api } from '../api';
import { sb } from './supabase';

export const AVATAR_LOOKS: { id: string; bg: string }[] = [
  { id: 'g1', bg: 'linear-gradient(135deg,#ff9a8b,#ff6a88 55%,#ff99ac)' },
  { id: 'g2', bg: 'linear-gradient(135deg,#43e97b,#38f9d7)' },
  { id: 'g3', bg: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
  { id: 'g4', bg: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
  { id: 'g5', bg: 'linear-gradient(135deg,#f6d365,#fda085)' },
  { id: 'g6', bg: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { id: 'g7', bg: 'linear-gradient(135deg,#0ba360,#3cba92)' },
  { id: 'g8', bg: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  { id: 'g9', bg: 'linear-gradient(135deg,#30cfd0,#330867)' },
  { id: 'g10', bg: 'linear-gradient(135deg,#fa709a,#fee140)' },
  { id: 'g11', bg: 'linear-gradient(135deg,#232526,#5b6470)' },
  { id: 'g12', bg: 'radial-gradient(circle at 30% 25%,#ffd27f,#ff7e5f 45%,#6a3093)' },
];
export const lookBg = (look?: string) => AVATAR_LOOKS.find(a => a.id === look)?.bg;

const KEY = 'devdesk-avatar';
export const localAvatar = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } };

/** Saves the choice ('photo', 'initials' or a look id) */
export async function saveAvatar(choice: string) {
  try { localStorage.setItem(KEY, choice) } catch { /* private mode */ }
  if (api.kind === 'supabase') {
    const { error } = await sb().auth.updateUser({ data: { avatar: choice } });
    if (error) throw new Error(error.message);
  }
}
