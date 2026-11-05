// Shared helpers for the end-to-end tests. Every test runs in a fresh browser context, so the sample-data backend
// starts from a clean data set (it keeps its data in that context's localStorage) – no clean-up needed there.
import { expect, type Page } from '@playwright/test';

/** opens a route (hash) and waits until the app has loaded and the page header shows */
export async function open(page: Page, route = 'home') {
  await page.goto('/#' + route);
  await expect(page.locator('.crumb').first()).toBeVisible();
  // the preloader (role=status, "Loading") covers the app until the data is in
  await expect(page.locator('[role=status]').filter({ hasText: /^Loading/ })).toHaveCount(0, { timeout: 15_000 });
  // The sidebar rail slides open over the left edge of the page while the pointer is on it or focus is inside it. On
  // GitHub's Linux runner it was open after loading and blocked clicks there. Start every test like a user whose
  // pointer and focus are on the page itself: mouse away from the rail, no focus in the sidebar, sidebar closed.
  const vp = page.viewportSize();
  if (vp) await page.mouse.move(Math.round(vp.width * 0.6), vp.height - 4);
  await page.evaluate(() => { const a = document.activeElement; if (a instanceof HTMLElement && a.closest('.side')) a.blur() });
  await expect(page.locator('.side[data-peek]')).toHaveCount(0);
}

/** a unique, recognisable title for data a test creates */
export const unique = (what: string) => `E2E ${what} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** creates a ticket through the New ticket dialog and returns its title; the app then opens the new ticket */
export async function createTicket(page: Page, title = unique('ticket')) {
  await page.getByRole('button', { name: 'New ticket', exact: true }).first().click();
  const dialog = page.locator('.modal');
  await dialog.getByPlaceholder('Ticket title').fill(title);
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('h1.tp-title')).toHaveText(title);
  return title;
}

const ROUTE: Record<string, string> = { Home: 'home', Inbox: 'inbox', 'My tickets': 'list/active', Timesheet: 'timesheet', Calendar: 'calendar',
  Timeline: 'timeline', Insights: 'insights', Knowledge: 'kb' };
/** goes to a main page inside the running app (no reload); the sidebar itself is tested in dashboard.spec */
export async function nav(page: Page, name: keyof typeof ROUTE | string) {
  await page.evaluate(r => { location.hash = r }, ROUTE[name] ?? name);
  await expect(page.locator('.crumb').first()).toContainText(name);
}

/** clicks a sidebar link the way a person does: the collapsed rail opens on hover first */
export async function sideLink(page: Page, name: string) {
  await page.locator('.side').hover();
  await page.locator('.side').getByRole('link', { name: new RegExp(`^${name}`) }).click();
}

/** reads what the sample-data backend has stored – used to verify persistence, not only the screen */
export interface StoredTicket { TicketUUID: string; TicketId: string; Title: string; Status: string; Priority: string; DueDate: string | null; _Worklog?: { Hours: number; Activity: string; CommentText?: string }[] }
export interface Stored { tickets: StoredTicket[]; articles: { Title: string; ArticleType: string }[]; links?: { FromTicket: string; ToTicket: string }[] }
/** the sample backend writes its store on the first change; before that it is empty */
export async function stored(page: Page): Promise<Stored> {
  return (await page.evaluate(() => JSON.parse(localStorage.getItem('devdesk-mock-v1') ?? 'null'))) ?? { tickets: [], articles: [], links: [] };
}
export const ticketByTitle = async (page: Page, title: string) => (await stored(page)).tickets.find(t => t.Title === title);
