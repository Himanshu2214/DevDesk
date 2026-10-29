// Recently opened tickets (per browser), shown first in the command palette.
const KEY = 'devdesk-recent';

export function recentTickets(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as string[] } catch { return [] }
}
export function rememberTicket(ticketId: string) {
  try { localStorage.setItem(KEY, JSON.stringify([ticketId, ...recentTickets().filter(x => x !== ticketId)].slice(0, 6))) } catch { /* private mode */ }
}
