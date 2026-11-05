// Journeys 7 and 8 (cloud) – organization invitation and acceptance; sharing inside it applies at once; removing a
// member unshares what was shared through the organization but keeps a direct (outside) share.
import { expect, test, type Browser } from '@playwright/test';
import { admin, createUser, removeUsers, seedTicket, signIn, type TestUser } from './cloud';

let adminU: TestUser, member: TestUser;
const run = Date.now().toString(36);
async function as(browser: Browser, u: TestUser) { const p = await (await browser.newContext()).newPage(); await signIn(p, u); return p }

test.beforeAll(async () => { adminU = await createUser('orgadmin'); member = await createUser('member') });
test.afterAll(async () => { await removeUsers(member, adminU) });

test('invite, accept, share inside, remove: only the organization share goes', async ({ browser }) => {
  const direct = await seedTicket(adminU, `E2E direct ${run}`);
  const inside = await seedTicket(adminU, `E2E inside ${run}`);
  const a = await as(browser, adminU), m = await as(browser, member);

  // a direct share before the organization exists: an invitation the member accepts (made in the app, as the owner)
  await a.goto(`/#ticket/${direct.ticketId}`);
  await a.locator('.share-btn').click();
  await a.getByLabel('Email of the person to share with').fill(member.email);
  await a.locator('.share-add').getByRole('button', { name: 'Share' }).click();
  await a.keyboard.press('Escape');
  await m.goto('/#inbox');
  await m.reload();                                                  // the Inbox refreshes invitations every minute; opening the app loads them now
  // the invitation row itself ("… · accept or decline"), not the notification about it, which can load first
  await m.getByText(new RegExp(`^${direct.ticketId} .* · accept or decline$`)).click();
  await m.getByRole('button', { name: 'Accept' }).click();

  // the organization
  await a.goto('/#account');
  await a.getByLabel('Organization name').fill(`E2E Org ${run}`);
  await a.getByRole('button', { name: 'Create organization' }).click();
  await a.getByLabel('Email to invite').fill(member.email);
  await a.locator('.org-invite').getByRole('button', { name: 'Invite' }).click();
  await expect(a.getByText(member.email)).toBeVisible();

  await m.goto('/#inbox');
  await m.reload();                                                  // the Inbox refreshes invitations every minute; opening the app loads them now
  await m.getByText(/^Join as /).click();                            // the organization invitation row
  await m.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await admin.from('org_members').select('user_id')).data?.some(r => r.user_id === member.id)).toBe(true);

  // inside the organization a share applies at once
  await a.goto(`/#ticket/${inside.ticketId}`);
  await a.locator('.share-btn').click();
  await a.getByLabel('Email of the person to share with').fill(member.email);
  await a.locator('.share-add').getByRole('button', { name: 'Share' }).click();
  await expect(a.getByText(new RegExp(`${inside.ticketId} shared with`))).toBeVisible();
  await a.keyboard.press('Escape');
  await m.goto(`/#ticket/${inside.ticketId}`);
  await m.reload();
  await expect(m.locator('h1.tp-title')).toHaveText(`E2E inside ${run}`);

  // removal: the organization share goes, the direct one stays
  await a.goto('/#account');
  await a.reload();                                                  // the member list was loaded before the member joined
  await a.getByRole('button', { name: `Remove ${member.name}` }).click();
  await a.getByRole('alertdialog').getByRole('button', { name: /Remove/ }).click();
  await expect.poll(async () => (await admin.from('ticket_shares').select('TicketUUID').eq('member_id', member.id)).data?.map(r => r.TicketUUID).sort())
    .toEqual([direct.id]);
  await m.goto(`/#ticket/${inside.ticketId}`);
  await m.reload();
  await expect(m.getByText(/not found/)).toBeVisible();
  await m.goto(`/#ticket/${direct.ticketId}`);
  await expect(m.locator('h1.tp-title')).toHaveText(`E2E direct ${run}`);
});
