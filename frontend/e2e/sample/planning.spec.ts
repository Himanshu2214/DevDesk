// Journeys 10 and 11 – calendar due dates (set, then moved by dragging) and Gantt dates and dependencies (sample data).
// Google Calendar meetings need a real Google account: they are on the manual checklist (e2e/README.md).
import { expect, test, type Page } from '@playwright/test';
import { createTicket, nav, open, stored, ticketByTitle } from '../helpers';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** a weekday in the current month that is not today, so it is visible in the month view */
function dayThisMonth(offset: number) { const d = new Date(); d.setDate(Math.min(Math.max(2, d.getDate() + offset), 27)); return d }

/** on the ticket's own page: set its due date by typing it into the date picker */
async function setDue(page: Page, title: string, value: string) {
  await expect(page.locator('h1.tp-title')).toHaveText(title);
  await page.getByRole('button', { name: /^Due date:/ }).click();
  await page.getByRole('menuitem', { name: /Pick a date/ }).click();
  await page.locator('.cal-type input[type=date]').fill(value);
  await expect.poll(async () => (await ticketByTitle(page, title))?.DueDate).toBe(value);
}

test('a due date shows on the calendar and moves when the ticket is dragged to another day', async ({ page }) => {
  await open(page, 'list/active');
  const title = await createTicket(page);
  const from = dayThisMonth(-3), to = dayThisMonth(+3);
  test.skip(iso(from) === iso(to), 'month too short around today');
  await setDue(page, title, iso(from));

  await nav(page, 'Calendar');
  const event = page.locator('.fc-event', { hasText: title.slice(0, 20) });
  await expect(page.locator(`.fc-daygrid-day[data-date="${iso(from)}"]`).locator('.fc-event', { hasText: title.slice(0, 20) })).toBeVisible();

  await event.dragTo(page.locator(`.fc-daygrid-day[data-date="${iso(to)}"] .fc-daygrid-day-frame`));
  await expect.poll(async () => (await ticketByTitle(page, title))?.DueDate).toBe(iso(to));
  await expect(page.locator(`.fc-daygrid-day[data-date="${iso(to)}"]`).locator('.fc-event', { hasText: title.slice(0, 20) })).toBeVisible();
});

test('the Gantt timeline shows planned tickets and records a dependency', async ({ page }) => {
  test.slow();                                                       // two tickets, two dates, the Gantt: more steps than most
  await open(page, 'list/active');
  const first = await createTicket(page), second = await createTicket(page);
  const end = new Date(Date.now() + 5 * 864e5);
  await setDue(page, second, iso(end));                              // the second is open now
  await nav(page, 'My tickets');
  await page.locator('a', { hasText: first }).first().click();
  await setDue(page, first, iso(end));

  await nav(page, 'Timeline');
  const bar = (t: string) => page.locator('.wx-bar', { hasText: t.slice(0, 18) }).first();
  await expect(bar(first)).toBeVisible();
  await expect(bar(second)).toBeVisible();

  // the Gantt makes a dependency with two clicks: the end handle of the first bar, then the start handle of the second
  await bar(first).hover();
  await bar(first).locator('.wx-link.wx-right').click();
  await bar(second).hover();
  await bar(second).locator('.wx-link.wx-left').click();
  await expect(page.locator('.toast', { hasText: 'Dependency added' })).toBeVisible();
  const ids = async () => { const s = await stored(page); return [s.tickets.find(t => t.Title === first)?.TicketUUID, s.tickets.find(t => t.Title === second)?.TicketUUID] };
  const [f, sId] = await ids();
  await expect.poll(async () => ((await stored(page)).links ?? []).some(l => l.FromTicket === f && l.ToTicket === sId)).toBe(true);
});
