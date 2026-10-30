// The in-browser backend behaves like the SAP business object: numbering, defaults, status history, timer rounding, validations.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewTicket } from '../src/api/types';
import { mockApi, resetMock } from '../src/api/mock';

const draft = (p: Partial<NewTicket> = {}): NewTicket => ({ Title: 'Test ticket', Description: '', Priority: '2', Project: 'GST', Area: 'SD', Tech: 'ABAP',
  TicketType: 'BUG', Environment: '', Requester: '', Reference: '', DueDate: '', EstimateHours: 4, acceptance: ['Works'], status: 'BACKLOG', ...p });

describe('mock backend', () => {
  beforeEach(() => { localStorage.clear(); resetMock() });

  it('numbers new tickets after the sample data and adds defaults', async () => {
    const before = await mockApi.listTickets();
    const t = await mockApi.createTicket(draft());
    expect(t.TicketId).toBe('TK-' + (1001 + before.length));
    expect(t._Acceptance?.map(a => a.Text)).toEqual(['Works']);
    expect(t._Test).toHaveLength(1);
    expect(t._Checklist?.length).toBeGreaterThan(0);
  });

  it('rejects a ticket without title and an unknown project', async () => {
    await expect(mockApi.createTicket(draft({ Title: ' ' }))).rejects.toThrow('Enter a title');
    await expect(mockApi.createTicket(draft({ Project: 'NOPE' }))).rejects.toThrow('not maintained');
  });

  it('writes a history event on every status change and stamps the close date', async () => {
    const t = await mockApi.createTicket(draft());
    await mockApi.setStatus(t, 'DONE');
    const done = await mockApi.getTicket(t.TicketUUID);
    expect(done.Status).toBe('DONE');
    expect(done.ClosedAt).not.toBeNull();
    expect(done._Event?.at(-1)).toMatchObject({ StatusFrom: 'BACKLOG', StatusTo: 'DONE' });
  });

  it('rounds the timer to quarter hours (at least 0.25 h)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t = await mockApi.createTicket(draft());
      await mockApi.startTimer(await mockApi.getTicket(t.TicketUUID));
      vi.setSystemTime(Date.now() + 40 * 60e3);
      await mockApi.stopTimer(await mockApi.getTicket(t.TicketUUID));
      const after = await mockApi.getTicket(t.TicketUUID);
      expect(after._Worklog?.at(-1)?.Hours).toBe(0.75);
      expect(after.TimerStartedAt).toBeNull();
    } finally { vi.useRealTimers() }
  });

  it('refuses stale updates (etag check)', async () => {
    const t = await mockApi.createTicket(draft());
    await mockApi.updateTicket(t, { Title: 'Renamed' });
    await expect(mockApi.updateTicket(t, { Title: 'Again' })).rejects.toThrow('changed this item');
  });

  it('validates logged hours', async () => {
    const t = await mockApi.createTicket(draft());
    await expect(mockApi.createChild(t, '_Worklog', { Hours: 30, WorkDate: '2026-01-01' })).rejects.toThrow('at most 24');
  });
});
