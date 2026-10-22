# DevDesk – data model and RAP / OData V4 design

Target: S/4HANA 2025, SAP_BASIS 816. Prefix `ZDD` (DevDesk). The naming follows the Program Change History app (`ZPCH_*` tables, `ZR_PCH_*` / `ZC_PCH_*` CDS, `ZUI_PCH_O4`).

Status: **proposal, updated for mockup v0.5** – nothing has been created in SAP yet. The code lives in GitHub. There is no SAP package yet: objects can be created as local objects (`$TMP`) for a first test and moved to a package (for example `ZDD`) later with SE03 / "Change package assignment".

Build order (from the feature notes): **phase 1** core tickets → **phase 2** developer workflow (objects, work log, knowledge, transports) → **phase 3** SAP integration (import status job, E070/E071) → **phase 4** intelligence (impact analysis on real dependencies, reminders, AI-assisted texts). The AI assistant and live SAP sync are not in v1.

---

## 1. Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Managed RAP without draft** | The UI saves every change at once: status from the board, inline title, a ticked checklist item. With draft, each would need edit → activate round trips. Without draft, each change is one PATCH or action with an ETag; validations still run on save. New tickets are one deep POST. |
| D2 | **Status changes only through the action `setStatus`** | `Status` is read-only. The action sets status, `StatusChangedAt` and `ClosedAt`, and writes an event – the basis for activity, inbox and cycle time. |
| D3 | **`strict ( 2 )`, UUID keys, readable number `TK-1042` from number range `ZDD_TKT`** | 816 supports strict mode 2. UUIDs keep deep create simple. |
| D4 | **TR objects are read live from E070/E071** | Only the ticket ↔ TR link, import status and the deployment notes are stored. |
| D5 | **Standard ABAP; SAP-internal access wrapped in `ZCL_DD_TRANSPORT_READER`** | E070/E071 and the TMS function modules are not released APIs. |
| D6 | **Metrics are computed in the browser (v1)** | Small data volume. The service exposes tickets, events and work logs; the charts are calculated in the browser, as in the mockup. |
| D7 | **"Live": polling first (30 s), push later** | AMC/APC WebSocket can follow if needed. |
| D8 | **Only your own data** | Access controls restrict every view to `CreatedBy = $session.user`. |
| D9 | **The object registry is your own catalogue, not a copy of the repository** | You register the objects that matter (with description and dependencies); TADIR is used only for a value help and an "exists?" check. The dependencies drive the impact map. |
| D10 | **No credentials in DevDesk** | API examples store only a *reference* (SM59 destination, secure store entry). Validation rejects text that looks like a password or token field. |

---

## 2. Tables

All tables are client-dependent. Business tables have delivery class A and carry `created_by`, `created_at`, `last_changed_by`, `last_changed_at` and `local_last_changed` (ETag); children carry at least `local_last_changed`.

### Tickets (BO `ZR_DD_Ticket`)

| Table | Purpose | Main fields |
|---|---|---|
| `ZDD_TKT` | Ticket (root) | `ticket_uuid`, `ticket_no` NUMC 8, `title`, `description` STRING, `status` (BACKLOG, TODO, PROG, TEST, BLOCK, DONE), `priority` (1 Urgent … 4 Low), `project`, `area` (SD, MM, FI, PP, PS, BASIS), `tech` (RAP, CDS, ABAP, ODATA, FIORI, INTEG, FORM), `ticket_type`, `environment` (DEV/QA/PRD), `assignee` (SAP user), `requester`, `reference`, `due_date`, `estimate_h`, `status_changed_at`, `closed_at`, `timer_started_at` |
| `ZDD_ACC` | Acceptance criteria | `acc_uuid`, `ticket_uuid`, `position`, `text` |
| `ZDD_TEST` | Test cases | `test_uuid`, `ticket_uuid`, `name`, `steps`, `expected`, `actual`, `result` (OPEN/PASS/FAIL), `tested_at` |
| `ZDD_CHK` | Release checklist | `item_uuid`, `ticket_uuid`, `category` (UNIT, INTEG, AUTH, ERROR, PERF, TRANSPORT), `text`, `is_done` |
| `ZDD_WLOG` | Work log | `wlog_uuid`, `ticket_uuid`, `work_date`, `hours`, `activity` (CODE, DEBUG, TEST, ANA, MEET, DOC), `comment_text`, `source` (TIMER/MANUAL) |
| `ZDD_NOTE` | Comments | `note_uuid`, `ticket_uuid`, `text` STRING |
| `ZDD_ATT` | Attachments | `att_uuid`, `ticket_uuid`, `file_name`, `mime_type`, `content` RAWSTRING (`@Semantics.largeObject`), `file_size` |
| `ZDD_TKT_OBJ` | Ticket ↔ technical object | `link_uuid`, `ticket_uuid`, `object_uuid` |
| `ZDD_EVENT` | Activity / inbox events | `event_uuid`, `ticket_uuid`, `kind` (STAT, TRIM, TRER, PROP), `status_from`, `status_to`, `trkorr`, `target_sys`, `rc`, `text`, `event_at`, `is_read` |

### Transports (BO `ZR_DD_Transport`, its own root, so a TR can exist before it's linked)

| Table | Main fields |
|---|---|
| `ZDD_TR` | `tr_uuid`, `trkorr`, `ticket_uuid` (link), `tr_text`, `tr_owner`, `tr_status`, `released_on`, `qa_rc`, `qa_imported_on`, `prd_rc`, `prd_imported_on`, `checked_at`, `test_evidence` STRING, `deploy_notes` STRING, `rollback_notes` STRING |
| `ZDD_TR_DEP` | `dep_uuid`, `tr_uuid`, `depends_on` TRKORR (import order and blockers) |

### Technical object registry (BO `ZR_DD_Object`)

| Table | Main fields |
|---|---|
| `ZDD_OBJ` | `object_uuid`, `pgmid`/`obj_type` (TABL, DDLS, BDEF, CLAS, PROG, TRAN, SRVD, SRVB, FUGR, SSFO) or custom types (FIORI, DEST, API), `obj_name`, `description`, `devclass`, `system_role`, `project` |
| `ZDD_OBJ_DEP` | `dep_uuid`, `object_uuid` (the dependent object), `uses_object_uuid`, `kind` (USES, EXPOSES, CALLS) – edges of the impact map |

### Knowledge base (BO `ZR_DD_Article`)

| Table | Main fields |
|---|---|
| `ZDD_KB` | `article_uuid`, `article_no`, `type` (SNIP, FIX, API, CONF, DECI), `title`, `tags` (comma list), and the type fields: `error`, `root_cause`, `location`, `fix`, `test_result`, `code` STRING, `code_lang`, `http_method`, `endpoint`, `request` STRING, `response` STRING, `response_codes`, `auth_reference`, `steps` STRING, `context`, `decision`, `consequences` |
| `ZDD_KB_LINK` | `link_uuid`, `article_uuid`, `ticket_uuid` or `object_uuid` |

### Configuration

| Table | Purpose |
|---|---|
| `ZDD_PROJECT` | Projects: `project`, `name`, `color`, `is_active` |
| `ZDD_VALUE` | Value lists (area, tech, type, activity, check category, status colours and WIP limits) |
| `ZDD_TEMPLATE` | New-ticket templates (title, project, area, tech, type, acceptance criteria, checklist) |
| `ZDD_CONFIG` | `QA_SID`, `PRD_SID`, `AUTO_DONE`, `WEEK_HOURS` (40), `MISSING_TIME_DAYS` (2), `POLL_SECONDS` (30), `HISTORY_DAYS` |

Number ranges: `ZDD_TKT` (tickets, from 1001), `ZDD_KB` (articles).

---

## 3. Business objects and CDS

```
ZR_DD_Ticket ─┬─ _Acceptance, _Test, _Checklist, _Worklog, _Note, _Attachment, _ObjectLink   (compositions)
              ├─ _Event                      (composition, created internally only)
              ├─ _Transport                  (association to ZR_DD_Transport via ticket_uuid)
              └─ _Stats                      (to-one: logged hours, TR count, open tests)
ZR_DD_Transport ─ _Dependency (composition), _Object → ZI_DD_TransportObject (E070/E071 live)
ZR_DD_Object    ─ _Dependency (composition), _UsedBy (inverse association), _Ticket, _Article
ZR_DD_Article   ─ _Link (composition)
ZC_DD_*         projections; ZI_DD_Value / ZI_DD_Project / ZI_DD_Template value helps
```

Calculated fields in `ZR_DD_Ticket`: `TicketId` (`TK-1042`), `IsOverdue`, `DaysInStatus`. In `ZR_DD_Transport`: `Phase` (DEV / QA / PRD / FAILED) for the tracker columns.

Impact map: the UI reads `ZR_DD_Object` with `_Dependency` and `_UsedBy` and walks the graph in the browser (a few hundred edges). Hierarchy CDS is not needed.

---

## 4. Behaviour (sketch)

| BO | Operations | Actions / determinations / validations |
|---|---|---|
| Ticket | create, update, delete; children create/update/delete | `setStatus(Status)`; `startTimer`, `stopTimer` (work log rounded to 0.25 h); `logTime(date, hours, activity, comment)`; static `markAllRead`; `setDefaults` and `assignTicketNo` (number range) on save; `validateTicket` (title, project, area, tech, due date) |
| Transport | create, update, delete, `_Dependency` | `refreshStatus` (E070/E07T + TMS import history); `validateTrkorr` (exists in E070, a request – not a task – not linked twice); `readHeader` on create |
| Object | create, update, delete, `_Dependency` | `validateObject` (TADIR check for repository types); `validateNoCycle` (a dependency may not close a loop) |
| Article | create, update, delete, `_Link` | `assignArticleNo`; `validateNoSecrets` (rejects fields that look like passwords, tokens or keys) |

Lessons from ZPCH that apply: no actions on authorization-dependent child entities (dump `CX_RAP_HANDLER_NOT_IMPLEMENTED`), so all actions sit on root entities. `$orderby` is not supported inside `$expand`, so sorting happens in the browser.

---

## 5. Transport import status (phase 3)

Background job `ZDD_CHECK_IMPORTS` (every 15 min, scheduled under your own user) runs `refreshStatus` for all TRs not yet in PRD. QA and PRD dates and return codes come from the TMS import history (`TMS_TM_GET_HISTORY`), with the cofile (`TR_READ_GLOBAL_INFO_OF_REQUEST`) as fallback – the same approach as `ZPCH_CHECK_PRD_IMPORTS`. It writes TRIM / TRER events (inbox: "import failed RC 8"). If `AUTO_DONE = X`, a ticket in Testing whose TRs are all in PRD can move to Done.

---

## 6. Service

Service definition `ZUI_DD` with binding `ZUI_DD_O4` (OData V4 – UI). It exposes Ticket (+ children), Transport, TransportObject, Object (+ dependencies), Article (+ links), Event, Project, Value and Template.

| Screen | Main requests |
|---|---|
| Home | `Ticket?$filter=Status ne 'DONE'&$expand=_Stats`, `Worklog?$filter=WorkDate ge <monday>` |
| My tickets / board | `Ticket?$filter=…` (one request), status via `setStatus` |
| Ticket page | `Ticket(…)?$expand=_Acceptance,_Test,_Checklist,_Note,_Attachment,_ObjectLink,_Event,_Transport` |
| Transports | `Transport?$expand=_Dependency` |
| Objects + impact map | `Object?$expand=_Dependency` (whole graph, cached) |
| Knowledge | `Article?$search=…` or `$filter=contains(Title,…)`, `$expand=_Link` |
| Timesheet | `Worklog?$filter=WorkDate ge … and WorkDate le …` |

---

## 7. Frontend, security, build order

- **Frontend:** React + TypeScript + Vite, ported from the mockup (Inter font and ECharts bundled). Deployed as BSP `ZDD_APP` with `/UI5/UI5_REPOSITORY_LOAD`, then `/UI5/APP_INDEX_CALCULATE`.
- **Security:**
  - Access controls restrict all views to your own data (`CreatedBy = aspect user`).
  - The instance authorization only allows the owner to change.
  - No credentials anywhere (D10).
- **Build order:**
  1. Phase 1: tables, value tables, Ticket BO (status, priority, project, area, tech, estimate, comments, work log, checklist), service and UI.
  2. Phase 2: object registry with dependencies, knowledge base, transport tracker (manual entry), tests, attachments.
  3. Phase 3: E070/E071 reader, import job, inbox events.
  4. Phase 4: missing-time and due-date reminders (mail), AI-assisted descriptions and test cases (with review).

## 8. Open questions

1. Which system and client should host DevDesk? If it's a DEV client, Basis must keep the `ZDD_*` tables through client refreshes.
2. What are the QA and PRD system IDs of the 2025 landscape (needed in phase 3)?
3. Are attachments kept in SAP (RAWSTRING, size limit about 10 MB per file), or only as links to SharePoint/OneDrive?
