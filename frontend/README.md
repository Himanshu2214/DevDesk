# DevDesk frontend – phase 1

React 18 + TypeScript + Vite, with the same look as the mockup (Inter font and ECharts bundled, no CDN). It talks to the OData V4 service **`ZUI_DD_O4`**: tickets, acceptance criteria, test cases, checklist, work log, comments and status events.

## Screens in phase 1

| Screen | What works |
|---|---|
| **Home** | Open / overdue / hours this week / in testing; *My focus today*; time by activity; *Needs attention* (overdue, blocked, missing time) |
| **Inbox** | Status events (read/unread via `TicketEvent.IsRead`), overdue tickets and missing time pinned on top, preview with *Change status* and *Log time* |
| **My tickets** | Active / Backlog / All, views (Overdue, Due this week, Blocked, Recently done), projects; list with `J`/`K`/`Enter`/`S`, board with drag and drop and WIP limits; status and priority menus in place |
| **Ticket page** | Edit title and description inline; acceptance criteria (each new one also adds a test case); test results (Open → Passed → Failed); release checklist; comments; activity; all properties; timer (start/stop, a running timer on another ticket is stopped first); *Log…*; delete |
| **Timesheet** | Week grid, estimate vs actual, by activity, missing time, over estimate, *Log time* |
| **Global** | `C` new ticket (deep insert, then `setStatus` if the status isn't Backlog), `Ctrl+K` palette, sidebar timer (persisted in SAP, so it survives a reload), light/dark, polling every 30 s |

Transports, Objects, Knowledge and Insights show a "phase 2" page.

## Libraries

| Library | Used for |
|---|---|
| [TanStack Query](https://github.com/TanStack/query) | Data cache and background refresh (30 s, only while the tab is visible). Optimistic updates: a status change shows at once and is rolled back if SAP rejects it |
| [cmdk](https://github.com/dip/cmdk) | `Ctrl+K` palette: fuzzy search over all tickets, recently opened tickets, actions for the open ticket (set status, timer, log time), navigation |
| [dnd-kit](https://github.com/clauderic/dnd-kit) | Board drag and drop with a floating preview; a drag starts after 6 px, so a click still opens the ticket; keyboard dragging (Space, arrows, Space) |
| [Tiptap](https://github.com/ueberdosis/tiptap) | Rich text for descriptions and comments: bold/italic, headings, lists, task lists, inline code, code blocks for ABAP, links. Stored as HTML; older plain text is converted when shown |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Cleans all rich text before it's shown or saved |
| [ECharts](https://github.com/apache/echarts) | Hours-by-activity ring |

All are bundled into the build (no CDN). The JS bundle is about 1.1 MB (370 KB gzipped), mostly Tiptap; loading the editor lazily can come later if needed.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` uses the **mock backend**: sample data in your browser (localStorage), behaving like the RAP BO. The sidebar shows `MOCK`. To start the sample data fresh, clear the site data for `localhost:5181`.

### Against SAP (once ZUI_DD_O4 is published)

1. Copy `.env.sap.example` to `.env.sap.local`. It isn't committed. Set `VITE_SAP_TARGET` (for example `https://<host>:<port>`) and `VITE_SAP_CLIENT`.
2. Run `npm run dev:sap`. Vite forwards `/sap/*` to the system; the browser asks for your SAP user and password (basic authentication through the proxy). The sidebar shows `SAP`.

## Deploy as BSP `ZDD_APP`

1. Run `npm run build`. It creates `dist/` with `index.html` and one JS and one CSS file; fonts are inlined.
2. In SE38, run `/UI5/UI5_REPOSITORY_LOAD`:
   - Name `ZDD_APP`, *Upload*, folder `frontend/dist`.
   - Description "DevDesk".
   - Package **`$TMP`** (local object, no transport), or your package later.
3. In SE38, run `/UI5/APP_INDEX_CALCULATE` for `ZDD_APP`.
4. Open `https://<host>:<port>/sap/bc/ui5_ui5/sap/zdd_app/index.html?sap-client=<client>`. App and service are on the same host, so there's no CORS setup, and login is your normal SAP logon.
5. Optional: add a launchpad tile with a URL target to the same path, as for ZPCH_APP.

## First connection checklist

The OData client follows the RAP V4 conventions. Check these once against the real service and fix them in `src/api/odata.ts` if needed:

| Assumption | Where |
|---|---|
| Keys are `Edm.Guid`, written unquoted: `Ticket(TicketUUID=0050…)` | `key()` |
| Action names are `com.sap.gateway.srvd.zui_dd.v0001.setStatus` (namespace from `$metadata`) | `NS` |
| Decimals arrive as strings with `IEEE754Compatible=true` and are converted to numbers | `ACCEPT`, `mapTicket` |
| `abap_boolean` fields (`IsDone`, `IsRead`, `IsOverdue`) are `Edm.Boolean` | types |
| Actions and PATCH need `If-Match` (the ETag from the last read) | `request()` |
| User name from `/sap/bc/ui2/start_up` (falls back to empty) | `odataApi.user` |

Open `<service URL>/$metadata` to compare. A failing request shows the SAP error text in a red toast.

## Structure

```
src/
  api/types.ts     entity types (= CDS element names) and the Api interface
  api/odata.ts     OData V4 client: sap-client, CSRF token, ETag, deep insert, actions, errors
  api/mock.ts      in-browser backend with the BO's behaviour (defaults, events, timer rounding)
  store.tsx        data, polling, run(): every change goes through it and refreshes the affected ticket
  components/      icons, menu, page frame, sidebar, dialogs (new ticket, log time, palette), donut
  views/           Home, Inbox, TicketList (list + board), TicketPage, Timesheet, Placeholder
  styles/          app.css / app2.css from the mockup + react.css
```
