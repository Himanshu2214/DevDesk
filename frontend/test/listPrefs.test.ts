import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '../src/api/types';
import { activeFilterCount, applyFilters, EMPTY_PREFS, type ListPrefs, sorter } from '../src/lib/listPrefs';

const t = (id: string, p: Partial<Ticket>) => ({ TicketId: id, Status: 'TODO', Priority: '3', Project: 'GEN', Tech: 'ABAP', TicketType: 'BUG', DueDate: null, CreatedAt: null, LastChangedAt: null, ...p }) as Ticket;
const prefs = (p: Partial<ListPrefs> & { filters?: Partial<ListPrefs['filters']> }): ListPrefs => ({ ...EMPTY_PREFS, ...p, filters: { ...EMPTY_PREFS.filters, ...p.filters } });
const ids = (list: Ticket[]) => list.map(x => x.TicketId);

const LIST = [
  t('A', { Project: 'GST', Priority: '1', DueDate: '2026-10-20' }),
  t('B', { Project: 'GATE', DueDate: '2026-11-02', CreatedAt: '2026-10-01T00:00:00Z' }),
  t('C', { Project: 'GST', DueDate: '2026-10-20', Status: 'DONE', CreatedAt: '2026-10-05T00:00:00Z' }),
  t('D', { Project: 'FIN', Tech: 'RAP' }),
];

describe('ticket list filters', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T10:00:00')) });
  afterEach(() => { vi.useRealTimers() });

  it('keeps everything without filters', () => expect(ids(applyFilters(LIST, EMPTY_PREFS))).toEqual(['A', 'B', 'C', 'D']));
  it('combines values of one field with OR and fields with AND', () => {
    expect(ids(applyFilters(LIST, prefs({ filters: { Project: ['GST', 'FIN'] } })))).toEqual(['A', 'C', 'D']);
    expect(ids(applyFilters(LIST, prefs({ filters: { Project: ['GST', 'FIN'], Tech: ['RAP'] } })))).toEqual(['D']);
  });
  it('filters by due date: overdue (open only), this week, none', () => {
    expect(ids(applyFilters(LIST, prefs({ due: 'overdue' })))).toEqual(['A']);
    expect(ids(applyFilters(LIST, prefs({ due: 'week' })))).toEqual(['B']);
    expect(ids(applyFilters(LIST, prefs({ due: 'none' })))).toEqual(['D']);
  });
  it('counts active filters', () => expect(activeFilterCount(prefs({ filters: { Project: ['GST', 'FIN'] }, due: 'week' }))).toBe(3));
  it('sorts newest first and by due date', () => {
    expect(ids([...LIST].sort(sorter('created'))).slice(0, 2)).toEqual(['C', 'B']);
    expect(ids([...LIST].sort(sorter('due')))).toEqual(['A', 'C', 'B', 'D']);
  });
});
