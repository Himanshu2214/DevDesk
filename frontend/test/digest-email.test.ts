// Daily email layout (supabase/functions/_shared/digest-email.ts)
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { digestEmail, type DigestTicket } from '../../supabase/functions/_shared/digest-email';

const t = (TicketId: string, Status: string, Priority: string, DueDate: string | null, Title = 'Fix <b>GST</b> & e-invoice') =>
  ({ TicketId, Title, Status, Priority, DueDate, ProjectName: 'GST & e-invoicing' }) as DigestTicket;
const tickets = [t('TK-1011', 'TEST', '1', '2026-10-16', 'MRP link report: performance on large plants'), t('TK-1005', 'TODO', '1', '2026-10-28'),
  t('TK-1016', 'TODO', '2', '2026-10-30', 'Statement of account: add opening balance'), t('TK-1022', 'PROG', '3', '2026-10-31'),
  t('TK-1019', 'PROG', '2', '2026-11-20', 'ATC findings on custom code: triage'), t('TK-1009', 'BLOCK', '2', null, 'Gate entry OData: $expand to items is slow')];

describe('daily email', () => {
  const mail = digestEmail({ firstName: 'Himanshu', today: '2026-10-30', tickets, hoursYesterday: 6.5, appUrl: 'https://slatespace-32m.pages.dev' });
  it('has a subject with the counts', () => expect(mail.subject).toBe('2 overdue · 1 due today – SLATE·SPACE'));
  it('puts tickets in table rows with status, priority and due', () => {
    expect(mail.html).toContain('>Ticket</th>');
    expect(mail.html).toContain('#ticket/TK-1011');
    expect(mail.html).toContain('14d late');
    expect(mail.html).toContain('Tomorrow');
    expect(mail.html).toContain('>Blocked</span>');
    expect(mail.html).not.toContain('<b>GST</b>');                     // titles are escaped
    expect(mail.text).toContain('OVERDUE');
    if (process.env.DIGEST_PREVIEW) writeFileSync(process.env.DIGEST_PREVIEW, mail.html);   // preview: DIGEST_PREVIEW=path npx vitest run digest
  });
  it('says so when nothing is due', () => {
    expect(digestEmail({ firstName: '', today: '2026-10-30', tickets: [], hoursYesterday: 0, appUrl: '' }).html).toContain('a calm day');
  });
});
