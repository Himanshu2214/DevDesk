// Ticket templates: prefilled new-ticket forms. Starter templates are built in; your own are stored by the backend
// (Supabase table ticket_templates in standalone mode, this browser in SAP and sample-data mode).
import type { NewTicket, TemplateData, TicketTemplate } from '../api/types';
import { isoDate } from './format';

/** Built-in starters, always offered below your own templates */
export const STARTER_TEMPLATES: TicketTemplate[] = [
  { TemplateUUID: 'starter-bug', Name: 'Bug fix', Starter: true, Data: {
    Title: 'Bug: ', Description: 'What happens:\n\nExpected:\n\nSteps to reproduce:\n1. ', Priority: '2', TicketType: 'BUG', Environment: 'PRD', EstimateHours: 4, DueDays: 3,
    acceptance: ['The error no longer occurs with the original data', 'No regression in related processes'] } },
  { TemplateUUID: 'starter-cr', Name: 'Change request', Starter: true, Data: {
    Title: '', Description: 'Requested change:\n\nReason / business value:\n\nAffected users:', Priority: '3', TicketType: 'CR', Environment: 'DEV', EstimateHours: 8, DueDays: 10,
    acceptance: ['Requester confirms the change in QA'] } },
  { TemplateUUID: 'starter-rap', Name: 'New RAP app', Starter: true, Data: {
    Title: 'New app: ', Description: 'Business object:\n\nFields:\n\nActions / validations:', Priority: '3', Tech: 'RAP', TicketType: 'NEW', Environment: 'DEV', EstimateHours: 24, DueDays: 21,
    acceptance: ['Create, change and delete work from the Fiori app', 'Validations show clear messages', 'Authorization checks in place'] } },
];

/** The parts of the new-ticket form a template keeps (the due date as days from today) */
export function templateFrom(d: NewTicket, acceptance: string[]): TemplateData {
  const due = d.DueDate ? Math.round((Date.parse(d.DueDate + 'T00:00:00') - Date.parse(isoDate(new Date()) + 'T00:00:00')) / 864e5) : null;
  return { Title: d.Title, Description: d.Description, Priority: d.Priority, Project: d.Project, Area: d.Area, Tech: d.Tech, TicketType: d.TicketType,
    Environment: d.Environment, Requester: d.Requester, EstimateHours: d.EstimateHours, status: d.status, DueDays: due !== null && due >= 0 ? due : null, acceptance };
}

/** Form values from a template; fields the template leaves out keep the current value */
export function applyTemplate(base: NewTicket, data: TemplateData): { draft: NewTicket; acceptance: string } {
  const { DueDays, acceptance, ...rest } = data;
  const draft = { ...base, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null)) } as NewTicket;
  if (DueDays !== undefined) draft.DueDate = DueDays === null ? '' : isoDate(new Date(Date.now() + DueDays * 864e5));
  return { draft, acceptance: (acceptance ?? []).join('\n') };
}

/* ---------- browser storage (SAP and sample-data mode) ---------- */
const KEY = 'devdesk-templates';
const read = (): TicketTemplate[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } };
const write = (list: TicketTemplate[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { throw new Error('This browser does not allow saving templates (private mode?)') } };
export const localTemplates = {
  async list() { return read().sort((a, b) => a.Name.localeCompare(b.Name)) },
  async save(Name: string, Data: TemplateData) {
    const list = read(), same = list.find(t => t.Name.toLowerCase() === Name.toLowerCase());
    const tpl: TicketTemplate = { TemplateUUID: same?.TemplateUUID ?? crypto.randomUUID(), Name, Data };
    write([...list.filter(t => t !== same), tpl]);
    return tpl;
  },
  async remove(id: string) { write(read().filter(t => t.TemplateUUID !== id)) },
};
