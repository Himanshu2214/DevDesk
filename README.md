# DevDesk – personal ticketing tool for SAP ABAP work

A personal work tracker for SAP development. It covers tickets with acceptance criteria and tests, the SAP objects and transports behind each change, time tracking, and a knowledge base of fixes, snippets and API examples.

## Status

**Screen mockup v0.5 (current)** – clickable, runs on generated sample data. There is no backend yet, and changes are lost on reload.

- **Target:** S/4HANA 2025 (SAP_BASIS 816, S4CORE 109). The backend design is in [docs/backend-design.md](docs/backend-design.md): managed RAP without draft, `strict ( 2 )`, OData V4, prefix `ZDD`.
- **No SAP package yet:** the code is kept in GitHub. In SAP, objects can start as local objects (`$TMP`) and move to a package later.
- **ABAP phase 1 written:** the Ticket BO (10 tables, CDS, access controls, BDEF and class, service `ZUI_DD`, setup report, smoke test) is in [abap/](abap/). Follow [docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md) to create and activate every object step by step in `$TMP` (short version: [abap/README.md](abap/README.md)). It hasn't been activated in a system yet.
- **React frontend phase 1 written:** [frontend/](frontend/) is the real app for `ZUI_DD_O4`. It runs today with a mock backend (`npm run dev`), and `npm run build` produces the BSP `ZDD_APP`. See [frontend/README.md](frontend/README.md).
- **Not included:** Mojo integration, company logos.

## View the mockup

Everything is bundled, so no CDN is needed: the Inter font (OFL) is in `mockup/assets/fonts` and ECharts 5.6.0 (Apache-2.0) is in `mockup/vendor`.

```bash
cd mockup && python -m http.server 5180
```

Then open http://127.0.0.1:5180/index.html.

## Screens

| Screen | What it does |
|---|---|
| **Home** | Answers four questions: open tickets, overdue, hours this week, in testing. Also shows *My focus today* (by priority and due date), time this week by activity (donut) and *Needs attention*: overdue, blocked, failed imports, missing time. |
| **Inbox** | Overdue tickets, failed QA imports and missing time pinned on top, then status changes, imports, comments and logged time, with a preview pane. |
| **My tickets** | Workflow Backlog → To do → In progress → Testing → Blocked → Done. List view grouped by status, or a board with coloured columns, tag pills, WIP limits and drag and drop. Views: Overdue, Due this week, Blocked, Recently done. Filter by project in the sidebar. |
| **Ticket page** | Title, description and classification (project, area, tech, type, environment, assignee). Tabs: **Overview** (acceptance criteria, attachments, linked knowledge), **Tests & checklist** (test cases from the acceptance criteria; release checklist for unit, integration, authorization, error handling, performance and transport readiness), **SAP objects & transports**, **Activity** (comments, history, work log, *Save as fix* to the knowledge base). Right panel: estimate vs actual, timer, manual time entry. |
| **Transports** | Deployment tracker with Development → Quality → Production columns and a progress bar. Failed imports are marked red. A side panel shows the ticket, import dates and RC, dependencies, objects, test evidence, deployment notes and rollback notes. |
| **Objects** | Technical object registry: tables, CDS, BDEF, classes, reports, services, Fiori apps, destinations and APIs, grouped by project. For the selected object it shows the **impact map** (what it depends on, and what a change would affect), plus its tickets, transports and knowledge articles. |
| **Knowledge** | Search with filters (type, time range, tags). Types: Snippet, Error & fix (error, root cause, location, fix, test), API example (method, endpoint, request, response, codes, auth reference – never credentials), Config note, Design decision. Articles are editable and linked to tickets and objects. |
| **Timesheet** | Week grid with estimate vs actual, *Log time* for manual entries, split by activity, missing-time flags and tickets over estimate. |
| **Insights** | Progress chart (scope / started / completed, with projection), hours per week, and completion by project, area or tech. |

Keyboard: `Ctrl+K` search (tickets, objects, transports, articles) and commands, `C` new ticket, `J`/`K` move, `Enter` open, `S` status, `P` priority, `/` search the knowledge base, `Esc` back.

In the mockup, a simulated event every 15 s (status change, TR import, time logged) shows that screens update without a reload.

## Roadmap

1. **Phase 1 – core:** ticket CRUD, statuses, priorities, filters, search, keyboard shortcuts, persistence (RAP Ticket BO).
2. **Phase 2 – developer workflow:** object registry, work log and timer, knowledge base, transport tracker (manual).
3. **Phase 3 – SAP integration:** E070/E071 reader, TMS import-status job, inbox events.
4. **Phase 4 – intelligence:** reminders, impact analysis, AI-assisted descriptions, test cases and summaries (always reviewed before use).

## Files

- `mockup/index.html` – page shell
- `mockup/app.css`, `mockup/app2.css` – design tokens (dark default, light) and components
- `mockup/data.js` – sample data generator (replaced by the OData service later)
- `mockup/charts.js` – metrics and charts (donut, progress, hours)
- `mockup/core.js` – helpers, state, router, menus, palette, timer, live updates
- `mockup/views-work.js` – Home, ticket list/board, ticket page
- `mockup/views-sap.js` – Transports, Objects and impact map
- `mockup/views-more.js` – Inbox, Knowledge, Timesheet, Insights
- `docs/SETUP-GUIDE.md` – step-by-step creation of all SAP objects, app connection and BSP deployment, with checklist and troubleshooting
- `docs/backend-design.md` – data model and RAP design
- `abaplint.json`, `.github/workflows/ci.yml` – automatic checks on every push: frontend build and abaplint (see [docs/abapgit.md](docs/abapgit.md))
- `docs/abapgit.md` – abaplint rules explained, abapGit setup (SAP ↔ GitHub without copy-paste)
- `abap/` – ABAP sources, phase 1 (tables, cds, dcl, bdef, classes, srvd, reports) and activation guide
- `frontend/` – React + TypeScript app (phase 1) for the OData V4 service, mock backend for local use
