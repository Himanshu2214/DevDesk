// Journeys 6 and 9 (cloud) – sharing a ticket with view / comment / edit access, checked with two real users in two
// browsers; the invitation for someone outside the organization; the Changes tab and Undo.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, createUser, removeUser, seedTicket, signIn, type TestUser } from './cloud';

let owner: TestUser, other: TestUser;
let ownerPage: Page, otherPage: Page;
let ticket: { id: string; ticketId: string };
const title = `E2E shared ${Date.now().toString(36)}`;

async function as(browser: Browser, u: TestUser) { const p = await (await browser.newContext()).newPage(); await signIn(p, u); return p }
async function setAccess(level: 'Can view' | 'Can comment' | 'Can edit') {
  await ownerPage.goto(`/#ticket/${ticket.ticketId}`);
  await ownerPage.locator('.share-btn').click();
  await ownerPage.getByLabel(`Access for ${other.name}`).selectOption({ label: level });
  await expect.poll(async () => (await admin.from('ticket_shares').select('Access').eq('TicketUUID', ticket.id).eq('member_id', other.id).single()).data?.Access)
    .toBe({ 'Can view': 'view', 'Can comment': 'comment', 'Can edit': 'edit' }[level]);
  await ownerPage.keyboard.press('Escape');
}

test.beforeAll(async ({ browser }) => {
  owner = await createUser('owner'); other = await createUser('other');
  ticket = await seedTicket(owner, title);
  ownerPage = await as(browser, owner); otherPage = await as(browser, other);
});
test.afterAll(async () => { await removeUser(owner); await removeUser(other) });

test('sharing with someone outside the organization is an invitation they accept', async () => {
  await ownerPage.goto(`/#ticket/${ticket.ticketId}`);
  await ownerPage.locator('.share-btn').click();
  await ownerPage.getByLabel('Email of the person to share with').fill(other.email);
  await ownerPage.getByLabel('Access for the new person').selectOption({ label: 'Can view' });
  await ownerPage.locator('.share-add').getByRole('button', { name: 'Share' }).click();
  await expect(ownerPage.getByText(/Invitation sent/)).toBeVisible();
  await expect(ownerPage.getByText('invited · waiting to accept')).toBeVisible();

  await otherPage.goto(`/#ticket/${ticket.ticketId}`);
  await expect(otherPage.getByText(/not found/)).toBeVisible();          // no access before accepting
  await otherPage.goto('/#inbox');
  await otherPage.getByText(new RegExp(`wants to share ${ticket.ticketId}`)).click();
  await otherPage.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await admin.from('ticket_shares').select('Status').eq('TicketUUID', ticket.id).eq('member_id', other.id).single()).data?.Status).toBe('active');
});

test('view access: reads, cannot comment or change', async () => {
  await otherPage.goto(`/#ticket/${ticket.ticketId}`);
  await otherPage.reload();
  await expect(otherPage.locator('h1.tp-title')).toHaveText(title);
  await expect(otherPage.locator('.tp-access')).toContainText('to view');
  await expect(otherPage.locator('h1.tp-title')).toHaveAttribute('contenteditable', 'false');
  await expect(otherPage.locator('.props-set')).toBeDisabled();
  await otherPage.locator('.tp-tabs').getByRole('button', { name: /Activity/ }).click();
  await expect(otherPage.getByPlaceholder(/Leave a comment/)).toHaveCount(0);
});

test('comment access: comments, still cannot change the ticket', async () => {
  await setAccess('Can comment');
  await otherPage.reload();
  await otherPage.locator('.tp-tabs').getByRole('button', { name: /Activity/ }).click();
  const box = otherPage.locator('.tp-main .ProseMirror').last();
  await box.click();
  await box.pressSequentially('E2E comment from the other user');
  await otherPage.keyboard.press('Control+Enter');
  await expect.poll(async () => (await admin.from('notes').select('Text').eq('TicketUUID', ticket.id)).data?.map(n => n.Text).join(' ') ?? '').toContain('E2E comment from the other user');
  await expect(otherPage.locator('.props-set')).toBeDisabled();
});

test('edit access: changes the ticket; the owner sees who did it and can undo it', async () => {
  await setAccess('Can edit');
  await otherPage.reload();
  await otherPage.locator('.props [data-f="Priority"]').click();
  await otherPage.getByRole('menuitem', { name: /Urgent/ }).click();
  await expect.poll(async () => (await admin.from('tickets').select('Priority').eq('TicketUUID', ticket.id).single()).data?.Priority).toBe('1');

  await ownerPage.goto('/#list/active');
  await expect(ownerPage.locator('a', { hasText: title }).locator('.changed-dot')).toBeVisible();   // changed by someone else
  await ownerPage.goto(`/#ticket/${ticket.ticketId}`);
  await ownerPage.locator('.tp-tabs').getByRole('button', { name: 'Changes' }).click();
  const row = ownerPage.locator('.chg-list li', { hasText: 'priority' }).first();
  await expect(row).toContainText(other.name);
  await row.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await admin.from('tickets').select('Priority').eq('TicketUUID', ticket.id).single()).data?.Priority).not.toBe('1');
});
