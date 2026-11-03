# SLATE·SPACE – personal ticketing tool for SAP ABAP work

*Work. Without friction.*

A personal work tracker for SAP development. It covers tickets with acceptance criteria and tests, the SAP objects and transports behind each change, time tracking, planning, and a knowledge base of fixes, snippets and API examples.

## Ways to run it

The React app in [frontend/](frontend/) has three backends, chosen at build time:

| Backend | Command | What it is |
|---|---|---|
| **Sample data** | `npm run dev` | Runs fully in the browser with generated data. Changes are kept in the browser only. |
| **Supabase (standalone)** | `npm run dev:cloud` / `npm run build:cloud` | The hosted app: sign-in with email or Google plus a second step (emailed code or authenticator app; the browser is then trusted for 24 hours), your own data, shared projects, daily email, Google Calendar. Setup: [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md). |
| **SAP** | `npm run dev:sap` / `npm run build` | Talks to the OData V4 service `ZUI_DD_O4` and deploys as BSP `ZDD_APP`. The ABAP sources are in [abap/](abap/); setup: [docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md). Written, not yet activated in a system. |

```bash
cd frontend
npm install
npm run dev
```

Tests: `npm test` (unit tests, plus the Supabase migrations and security rules run in PGlite).

## Screens

| Screen | What it does |
|---|---|
| **Home** | Open tickets, overdue, hours this week, in testing; *My focus today*; time by activity; *Needs attention*. |
| **Inbox** | Overdue tickets, failed imports and missing time on top, then status changes, imports, comments and logged time. |
| **My tickets** | Backlog → To do → In progress → Testing → Blocked → Done, as a list or a board with drag and drop and WIP limits. Views, projects, templates, export. |
| **Ticket page** | Description, acceptance criteria, test cases, release checklist, SAP objects and transports, attachments and pasted screenshots, whiteboard drawings, code and diagrams, comments, history, timer and work log. |
| **Calendar** | Due dates and Google Calendar meetings; create meetings that appear in Google Calendar. |
| **Timeline** | Gantt planning with planned start, due date, dependencies and assignee. |
| **Transports** | Development → Quality → Production tracker; failed imports marked red. |
| **Objects** | Registry of tables, CDS, classes, services and APIs, with an impact map. |
| **Knowledge** | Snippets, error & fix, API examples, config notes and design decisions, linked to tickets and objects. |
| **Timesheet** | Week grid, estimate vs actual, missing-time flags. |
| **Insights** | Progress, hours per week, completion by project, area or tech. |

Keyboard: `Ctrl+K` search and commands, `C` new ticket, `J`/`K` move, `Enter` open, `S` status, `P` priority, `/` search the knowledge base, `?` all shortcuts, `Esc` back.

## Files

- `frontend/` – React + TypeScript app (see [frontend/README.md](frontend/README.md)); `frontend/test` – tests
- `supabase/` – database migrations, edge functions (sign-in codes, account deletion, daily email, share emails, calendar) and sample data
- `abap/` – ABAP sources (tables, CDS, access controls, behaviour, classes, service, reports)
- `docs/SUPABASE-SETUP.md` – standalone setup, step by step
- `docs/SETUP-GUIDE.md` – creating all SAP objects, app connection and BSP deployment
- `docs/backend-design.md` – data model and RAP design
- `docs/abapgit.md` – abaplint rules and abapGit setup
- `abaplint.json`, `.github/workflows/ci.yml` – checks on every push: tests, both builds and abaplint
