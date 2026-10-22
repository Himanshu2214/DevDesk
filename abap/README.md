# DevDesk ABAP – phase 1 (Ticket BO)

Source files for the SAP side of DevDesk, phase 1: tickets with acceptance criteria, test cases, release checklist, work log, comments and status events.

The code is the source of truth in GitHub. In SAP it goes into **local objects (`$TMP`)** for now. Later you can move it to a real package with SE03 → *Change Object Directory Entries*, or via abapGit.

- **Target:** S/4HANA 2025, SAP_BASIS 816 (`strict ( 2 )`, managed RAP without draft, OData V4).
- **Status:** written against the ZPCH patterns but **not yet activated in a system**. Expect small syntax fixes on the first activation. Note each one in the table at the end so the files stay in sync.

## Objects

| Type | Objects |
|---|---|
| Domain | `ZDD_TKT_NO` (NUMC 8) – only needed for the number range |
| Number range | `ZDD_TKT`, interval `01` |
| Tables (10) | `ZDD_TKT`, `ZDD_ACC`, `ZDD_CHK`, `ZDD_TEST`, `ZDD_WLOG`, `ZDD_NOTE`, `ZDD_EVENT`, `ZDD_PROJECT`, `ZDD_VALUE`, `ZDD_CONFIG` |
| CDS helpers | `ZI_DD_TicketHours`, `ZI_DD_Project`, `ZI_DD_Value`, abstract entity `ZA_DD_StatusParam` |
| CDS business object | `ZR_DD_Ticket` + `ZR_DD_Acceptance`, `ZR_DD_ChecklistItem`, `ZR_DD_TestCase`, `ZR_DD_Worklog`, `ZR_DD_Note`, `ZR_DD_Event` |
| CDS projections | `ZC_DD_Ticket` + the six `ZC_DD_*` children |
| Access controls | one per R and C view (14): only tickets you created are visible |
| Behavior | `ZR_DD_Ticket` (managed, `strict ( 2 )`), class `ZBP_R_DD_TICKET`, projection `ZC_DD_Ticket` |
| Service | definition `ZUI_DD`, binding `ZUI_DD_O4` (OData V4 – UI) |
| Programs | `ZDD_SETUP` (value lists, projects, configuration), class `ZCL_DD_SMOKE_TEST` (console test, F9) |

## Folder → object type in ADT

| Folder | File | Create in ADT as |
|---|---|---|
| `tables/` | `*.tabl.ddl` | Dictionary → Database Table |
| `cds/` | `*.ddls.asddls` | Core Data Services → Data Definition (for `za_*`: template *Abstract Entity*) |
| `dcl/` | `*.dcls.asdcls` | Core Data Services → Access Control |
| `bdef/` | `*.bdef.asbdef` | Right-click the root view → New Behavior Definition |
| `classes/` | `*.clas.abap`, `*.locals_imp.abap` | Global class / *Local Types* tab of the same class |
| `srvd/` | `*.srvd.srvdsrv` | Business Services → Service Definition |
| `reports/` | `*.prog.abap` | ABAP Program |

Every "New …" wizard asks for a package. Enter **`$TMP`**, and no transport request is needed.

## Step by step

### 1. Number range (once)

1. **Domain** `ZDD_TKT_NO`: in SE11 or ADT, data type NUMC, length 8, description "DevDesk ticket number". Activate it as a local object.
2. **SNRO**, object `ZDD_TKT` → *Create*:
   - Short text "DevDesk", long text "DevDesk ticket numbers".
   - Number length domain `ZDD_TKT_NO`, **no** to-year flag, warning 90 %.
   - Buffering: **No buffering**, so numbers stay consecutive.
   - Save as a local object.
3. **Intervals** → *Change intervals* → *Insert*: interval `01`, from `00001001` to `99999999`, external **off**. Save.

### 2. Tables

Create the 10 tables from `tables/`: paste the source and activate. The order doesn't matter. `ZDD_PROJECT`, `ZDD_VALUE` and `ZDD_CONFIG` allow maintenance. If you want SM30 for them, generate a maintenance dialog in SE54; for that you need a function group, and `$TMP` is fine.

### 3. CDS – in this order

1. `ZI_DD_TicketHours`, `ZI_DD_Project`, `ZI_DD_Value` and `ZA_DD_StatusParam`. Activate each one.
2. The business object: create **all seven** views first (`ZR_DD_Ticket` and the six children), paste each source, then activate them **together** (*Activate all*, `Ctrl+Shift+F3`). They reference each other, so activating one by one fails.
3. The projections: create all seven `ZC_DD_*`, paste, and activate them together.

### 4. Access controls

Create the 14 roles from `dcl/` (`ZR_DD_*` and `ZC_DD_*`) and activate them together. Without them, the views raise "no access control" warnings, and every user would see every ticket.

### 5. Behavior

1. Right-click `ZR_DD_Ticket` → *New Behavior Definition* (implementation type Managed) and replace the content with `bdef/zr_dd_ticket.bdef.asbdef`.
2. Activating reports that class `ZBP_R_DD_TICKET` is missing. Use the quick fix (`Ctrl+1`) to create it in `$TMP`.
3. In the class, paste `zbp_r_dd_ticket.clas.abap` into *Global Class* and `zbp_r_dd_ticket.clas.locals_imp.abap` into *Local Types*.
4. Activate the BDEF and the class together.
5. Right-click `ZC_DD_Ticket` → *New Behavior Definition* (Projection), paste `bdef/zc_dd_ticket.bdef.asbdef`, and activate it.

### 6. Service

1. Create service definition `ZUI_DD` from `srvd/zui_dd.srvd.srvdsrv` and activate it.
2. Right-click `ZUI_DD` → *New Service Binding*: name `ZUI_DD_O4`, binding type **OData V4 – UI**. Activate it, then click **Publish**. If publishing in ADT is not allowed, use `/IWFND/V4_ADMIN` → *Publish Service Groups* → system alias LOCAL → `ZUI_DD_O4`.
3. The binding shows the service URL, for example `/sap/opu/odata4/sap/zui_dd_o4/srvd/sap/zui_dd/0001/`.

### 7. Defaults

Create and run report **`ZDD_SETUP`** (F8). It fills the status, area, tech, type, activity and checklist value lists, five example projects and the configuration. Adjust the projects to your own work afterwards, in SM30 or by editing the report and running it with *P_RESET*.

### 8. Test

1. Create class **`ZCL_DD_SMOKE_TEST`** from `classes/zcl_dd_smoke_test.clas.abap`, activate it and press **F9**. The console should show:
   ```
   1. Ticket created
   2. setStatus PROG OK
   3. Timer, work log and comment OK
   4. TK-1001: status PROG, priority 3, due <today+7>, assignee <you>
      events 1 (expect 1), checklist items 6 ..., work log 2 entries / 1.75 h ..., test result OPEN
   5. Test ticket deleted
   ```
   To keep the ticket and look at it, set `gc_delete_afterwards` to `abap_false`.
2. Open `$metadata` from the binding URL in the browser. You should see the entity sets Ticket, Acceptance, ChecklistItem, TestCase, Worklog, Note, TicketEvent, Project and ValueList, and the actions setStatus, startTimer and stopTimer.
3. Optional: try the binding's *Preview* on Ticket. It has no UI annotations, so add columns in the table settings. DevDesk's own React UI comes next.

## How the UI uses the service

| UI action | Request |
|---|---|
| List / board | `GET Ticket?$filter=Status ne 'DONE'&$select=…` |
| New ticket | deep `POST Ticket` with `_Acceptance` and `_Test`; then `setStatus` if the status is not Backlog |
| Change status (board drag, menu) | `POST Ticket(TicketUUID=…)/com.sap.gateway.srvd.zui_dd.v0001.setStatus` with `{"Status":"TEST"}` and `If-Match` |
| Edit a field | `PATCH Ticket(…)` with `If-Match: <etag>` |
| Timer | `…/startTimer`, `…/stopTimer` (the UI stops a running timer on another ticket first) |
| Log time | `POST Ticket(…)/_Worklog` |
| Inbox "read" | `PATCH TicketEvent(…)` with `{"IsRead":true}` |

## Behaviour summary

- **Defaults on create:**
  - Status Backlog, priority 3, due date today + 7, assignee = you, environment DEV, type CR.
  - The release checklist is created from value list CHECKCAT.
  - The number `TK-<n>` is assigned on save.
- **`setStatus`** is the only way to change the status. It sets `StatusChangedAt`, sets `ClosedAt` for Done (and clears it on reopen), and writes a STAT event.
- **Timer:** `stopTimer` rounds the time to quarter hours, logs at least 0.25 h and at most 24 h, and picks the activity from the status: Testing → TEST, To do → ANA, otherwise CODE.
- **Validations:**
  - Title is required; priority must be 1–4.
  - Project, area, tech and type must exist in their value lists. A value list that isn't maintained yet accepts any value.
  - Environment must be DEV, QA or PRD; the estimate can't be negative.
  - Work log: more than 0 and at most 24 hours, no future dates, activity from the ACTIVITY value list.
- **Authorization:**
  - Access controls: you only see tickets you created.
  - Instance authorization: only the creator may change a ticket.
  - No authorization object yet; it can be added in `get_global_authorizations` later.

## Fixes during activation

Note every change made in SAP here, and copy it back into the files.

| Object | Problem | Fix |
|---|---|---|
| | | |
