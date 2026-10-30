import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewTicket } from '../src/api/types';
import { applyTemplate, localTemplates, STARTER_TEMPLATES, templateFrom } from '../src/lib/templates';

const base: NewTicket = { Title: '', Description: '', Priority: '3', Project: 'GST', Area: 'SD', Tech: 'ABAP', TicketType: 'CR', Environment: 'DEV',
  Requester: 'Finance', Reference: 'REF-1', DueDate: '2026-11-04', EstimateHours: 4, acceptance: [], status: 'TODO' };

describe('ticket templates', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-28T10:00:00')); localStorage.clear() });
  afterEach(() => { vi.useRealTimers() });

  it('fills the form and keeps fields the template leaves out', () => {
    const { draft, acceptance } = applyTemplate(base, STARTER_TEMPLATES[0].Data);
    expect(draft).toMatchObject({ Title: 'Bug: ', TicketType: 'BUG', Priority: '2', Project: 'GST', Requester: 'Finance', Reference: 'REF-1', DueDate: '2026-10-31' });
    expect(acceptance.split('\n')).toHaveLength(2);
  });
  it('stores the due date as days from today and round-trips', () => {
    const data = templateFrom(base, ['Works']);
    expect(data.DueDays).toBe(7);
    expect(data).not.toHaveProperty('Reference');
    expect(applyTemplate({ ...base, DueDate: '' }, data).draft.DueDate).toBe('2026-11-04');
  });
  it('saves, overwrites by name and deletes in browser storage', async () => {
    const a = await localTemplates.save('GST bug', { Priority: '1' });
    await localTemplates.save('gst BUG', { Priority: '2' });
    const list = await localTemplates.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ TemplateUUID: a.TemplateUUID, Data: { Priority: '2' } });
    await localTemplates.remove(a.TemplateUUID);
    expect(await localTemplates.list()).toEqual([]);
  });
});
