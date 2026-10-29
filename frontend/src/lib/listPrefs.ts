// Filter, grouping and sorting of the ticket list, remembered per view (localStorage).
import { useEffect, useState } from 'react';
import type { Ticket } from '../api';
import { daysUntil, isOpen, urgency } from './format';

export type FilterField = 'Priority' | 'Project' | 'Tech' | 'TicketType';
export type DueFilter = 'any' | 'overdue' | 'week' | 'none';
export type GroupBy = 'status' | 'project' | 'priority';
export type SortBy = 'urgency' | 'due' | 'priority' | 'created' | 'updated';
export interface ListPrefs { filters: Record<FilterField, string[]>; due: DueFilter; group: GroupBy; sort: SortBy }

export const EMPTY_PREFS: ListPrefs = { filters: { Priority: [], Project: [], Tech: [], TicketType: [] }, due: 'any', group: 'status', sort: 'urgency' };

export function useListPrefs(key: string): [ListPrefs, (p: ListPrefs) => void] {
  const storageKey = 'devdesk-prefs-' + key;
  const read = (): ListPrefs => { try { return { ...EMPTY_PREFS, ...JSON.parse(localStorage.getItem(storageKey) || '{}') } } catch { return EMPTY_PREFS } };
  const [prefs, setPrefs] = useState<ListPrefs>(read);
  useEffect(() => { setPrefs(read()) }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (p: ListPrefs) => { setPrefs(p); try { localStorage.setItem(storageKey, JSON.stringify(p)) } catch { /* private mode */ } };
  return [prefs, save];
}

export const activeFilterCount = (p: ListPrefs) => Object.values(p.filters).reduce((n, v) => n + v.length, 0) + (p.due !== 'any' ? 1 : 0);

export function applyFilters(list: Ticket[], p: ListPrefs): Ticket[] {
  const within = (t: Ticket, lo: number, hi: number) => { const d = daysUntil(t.DueDate); return d !== null && d >= lo && d <= hi };
  return list.filter(t => (Object.keys(p.filters) as FilterField[]).every(f => !p.filters[f].length || p.filters[f].includes(t[f]))
    && (p.due === 'any'
      || (p.due === 'none' && !t.DueDate)
      || (p.due === 'overdue' && isOpen(t) && within(t, -99999, -1))
      || (p.due === 'week' && isOpen(t) && within(t, 0, 7))));
}

export function sorter(by: SortBy): (a: Ticket, b: Ticket) => number {
  switch (by) {
    case 'due': return (a, b) => (a.DueDate ?? '9999').localeCompare(b.DueDate ?? '9999') || urgency(a, b);
    case 'priority': return (a, b) => a.Priority.localeCompare(b.Priority) || urgency(a, b);
    case 'created': return (a, b) => (b.CreatedAt ?? '').localeCompare(a.CreatedAt ?? '');
    case 'updated': return (a, b) => (b.LastChangedAt ?? '').localeCompare(a.LastChangedAt ?? '');
    default: return urgency;
  }
}

/** Order of the list as last shown, for previous / next on the ticket page */
export const rememberOrder = (ids: string[]) => { try { sessionStorage.setItem('devdesk-order', JSON.stringify(ids)) } catch { /* ignore */ } };
export const lastOrder = (): string[] => { try { return JSON.parse(sessionStorage.getItem('devdesk-order') || '[]') } catch { return [] } };
