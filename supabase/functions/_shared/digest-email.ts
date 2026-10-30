// The daily email's content: subject, plain text and an HTML version with summary tiles and one table per section
// (Ticket · Title · Status · Priority · Project · Due). Table layout with inline styles, so Gmail, Outlook and phone
// mail apps all show it the same. Plain TypeScript (previewed and tested in the frontend).

export interface DigestTicket { TicketId: string; Title: string; Status: string; Priority: string; DueDate: string | null; ProjectName: string }
export interface DigestInput { firstName: string; today: string; tickets: DigestTicket[]; hoursYesterday: number; appUrl: string }

const STATUS: Record<string, [string, string, string]> = {             // label, text colour, background
  BACKLOG: ['Backlog', '#5f6670', '#eef0f3'], TODO: ['To do', '#2c5ab0', '#e7efff'], PROG: ['In progress', '#8a6300', '#fff4d6'],
  TEST: ['Testing', '#00796a', '#ddf6f1'], BLOCK: ['Blocked', '#b42318', '#fde8e7'], DONE: ['Done', '#1f7a30', '#e3f5e6'],
};
const PRIO: Record<string, [string, string]> = { '1': ['Urgent', '#d92d20'], '2': ['High', '#d86c39'], '3': ['Medium', '#2f5fe0'], '4': ['Low', '#8a909a'] };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const day = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const addDays = (iso: string, n: number) => new Date(day(iso) + n * 864e5).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(day(iso)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const short = (iso: string) => new Date(day(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function digestEmail({ firstName, today, tickets, hoursYesterday, appUrl }: DigestInput) {
  const tomorrow = addDays(today, 1);
  const base = appUrl ? appUrl.replace(/\/?$/, '/') : '';
  const link = (t: DigestTicket) => (base ? `${base}#ticket/${encodeURIComponent(t.TicketId)}` : '');
  const sections: { title: string; colour: string; list: DigestTicket[] }[] = [
    { title: 'Overdue', colour: '#d92d20', list: tickets.filter(t => t.DueDate && t.DueDate < today) },
    { title: 'Due today', colour: '#d86c39', list: tickets.filter(t => t.DueDate === today) },
    { title: 'Due tomorrow', colour: '#2f5fe0', list: tickets.filter(t => t.DueDate === tomorrow) },
    { title: 'In progress', colour: '#0f1218', list: tickets.filter(t => ['PROG', 'TEST', 'BLOCK'].includes(t.Status) && !(t.DueDate && t.DueDate <= tomorrow)) },
  ];
  const [overdue, dueToday] = [sections[0].list.length, sections[1].list.length];
  const inProgress = tickets.filter(t => t.Status === 'PROG' || t.Status === 'TEST').length;
  const subject = overdue ? `${overdue} overdue · ${dueToday} due today – SLATE·SPACE`
    : dueToday ? `${dueToday} due today – SLATE·SPACE` : `Your day in SLATE·SPACE – ${tickets.length} open`;
  const hello = `Good morning${firstName ? ', ' + firstName : ''}`;

  /* ---------- plain text ---------- */
  const text = [`${hello} – ${nice(today)}`, '',
    `Overdue ${overdue} · Due today ${dueToday} · In progress ${inProgress} · Logged yesterday ${hoursYesterday} h`, '',
    ...sections.filter(s => s.list.length).flatMap(s => [s.title.toUpperCase(),
      ...s.list.map(t => `- ${t.TicketId}  ${t.Title}  [${STATUS[t.Status]?.[0] ?? t.Status}, ${PRIO[t.Priority]?.[0] ?? ''}${t.DueDate ? ', due ' + short(t.DueDate) : ''}]${link(t) ? '\n  ' + link(t) : ''}`), '']),
    sections.every(s => !s.list.length) ? 'Nothing overdue or due soon – a calm day.\n' : '',
    base ? `Open SLATE·SPACE: ${base}` : '', '', 'You get this email because the daily digest is on (Account → Daily email).'].join('\n');

  /* ---------- HTML ---------- */
  const tile = (label: string, value: string, colour: string) =>
    `<td width="25%" style="padding:4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6e8ec;border-radius:10px">
      <tr><td style="padding:12px 14px;font-family:${FONT}"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${colour};margin-top:4px">${value}</div></td></tr></table></td>`;
  const pill = (label: string, fg: string, bg: string) =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:600;white-space:nowrap">${label}</span>`;
  const due = (t: DigestTicket) => {
    if (!t.DueDate) return '<span style="color:#9aa0a8">–</span>';
    const late = Math.round((day(today) - day(t.DueDate)) / 864e5);
    if (late > 0) return `<span style="color:#d92d20;font-weight:600;white-space:nowrap">${late}d late</span>`;
    if (t.DueDate === today) return '<span style="color:#d86c39;font-weight:600">Today</span>';
    if (t.DueDate === tomorrow) return '<span style="color:#2f5fe0;font-weight:600">Tomorrow</span>';
    return `<span style="white-space:nowrap">${short(t.DueDate)}</span>`;
  };
  const th = (label: string, extra = '') => `<th align="left" style="padding:8px 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;font-weight:600;border-bottom:1px solid #e6e8ec;${extra}">${label}</th>`;
  const td = (html: string, extra = '') => `<td style="padding:10px;border-bottom:1px solid #f0f1f4;vertical-align:middle;font-size:13px;color:#1f2430;${extra}">${html}</td>`;
  // one table for all sections, so the columns line up from top to bottom; each section starts with a heading row
  const rows = (s: { title: string; colour: string; list: DigestTicket[] }) => `
      <tr><td colspan="5" style="padding:18px 10px 8px;background:#ffffff;font-family:${FONT};border-bottom:1px solid #e6e8ec">
        <span style="font-size:14px;font-weight:700;color:${s.colour}">${s.title}</span><span style="font-size:12px;color:#6b7280;margin-left:6px">${s.list.length}</span></td></tr>
      ${s.list.slice(0, 15).map(t => {
        const [sl, sf, sb] = STATUS[t.Status] ?? [t.Status, '#5f6670', '#eef0f3'], [pl, pc] = PRIO[t.Priority] ?? ['', '#8a909a'];
        return `<tr>${td(`<span style="color:#6b7280;white-space:nowrap">${esc(t.TicketId)}</span>`)}
          ${td((link(t) ? `<a href="${esc(link(t))}" style="color:#1f2430;text-decoration:none;font-weight:600">${esc(t.Title)}</a>` : `<b>${esc(t.Title)}</b>`) + `<div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(t.ProjectName)}</div>`)}
          ${td(pill(sl, sf, sb))}${td(`<span style="color:${pc};font-weight:600;white-space:nowrap">&#9679; ${pl}</span>`)}
          ${td(due(t))}</tr>`;
      }).join('')}
      ${s.list.length > 15 ? `<tr><td colspan="5" style="padding:8px 10px;font-family:${FONT};font-size:12px;color:#6b7280">and ${s.list.length - 15} more</td></tr>` : ''}`;
  const shown = sections.filter(s => s.list.length);
  const table = shown.length ? `<tr><td style="padding:18px 24px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6e8ec;border-radius:10px;border-collapse:separate;font-family:${FONT};overflow:hidden">
      <tr style="background:#f8f9fb">${th('Ticket', 'width:64px;border-top-left-radius:10px')}${th('Title · Project')}${th('Status', 'width:92px')}${th('Priority', 'width:78px')}${th('Due', 'width:72px;border-top-right-radius:10px')}</tr>
      ${shown.map(rows).join('')}
    </table></td></tr>` : '';

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:14px;border:1px solid #e6e8ec">
    <tr><td style="padding:22px 24px 6px;font-family:${FONT}">
      <div style="font-size:12px;letter-spacing:.14em;font-weight:700;color:#1f2430">SLATE<span style="color:#2f5fe0">·</span>SPACE</div>
      <h1 style="margin:16px 0 2px;font-size:22px;color:#0f1218">${esc(hello)}</h1>
      <div style="font-size:13px;color:#6b7280">${nice(today)} · ${tickets.length} open tickets</div></td></tr>
    <tr><td style="padding:12px 20px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${tile('Overdue', String(overdue), overdue ? '#d92d20' : '#1f7a30')}${tile('Due today', String(dueToday), dueToday ? '#d86c39' : '#1f2430')}
      ${tile('In progress', String(inProgress), '#1f2430')}${tile('Yesterday', hoursYesterday + ' h', '#2f5fe0')}</tr></table></td></tr>
    ${table}
    ${sections.every(s => !s.list.length) ? `<tr><td style="padding:22px 24px;font-family:${FONT};font-size:14px;color:#1f2430">Nothing overdue or due soon – a calm day.</td></tr>` : ''}
    ${base ? `<tr><td style="padding:24px"><a href="${esc(base)}" style="display:inline-block;background:#2f5fe0;color:#ffffff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-family:${FONT};font-size:14px">Open SLATE·SPACE</a></td></tr>` : ''}
    <tr><td style="padding:16px 24px 22px;border-top:1px solid #f0f1f4;font-family:${FONT};font-size:12px;color:#8a909a">
      You get this email because the daily digest is on. Turn it off in Account → Daily email.</td></tr>
  </table></td></tr></table></body></html>`;

  return { subject, text, html };
}
