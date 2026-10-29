# DevDesk – step-by-step setup in SAP

This guide creates every SAP object for DevDesk phase 1, connects the React app, and deploys it. Follow the parts in order, tick each box as you go, and check the result at the end of each step before moving on.

| Part | What you get | Time |
|---|---|---|
| [A. Preparation](#a-preparation) | Tools, authorizations, source files | 10 min |
| [B. Number range](#b-number-range) | Ticket numbers TK-1001, TK-1002, … | 10 min |
| [C. Tables](#c-tables-10) | 10 database tables | 20 min |
| [D. CDS views](#d-cds-views-18) | Data model, projections, value helps | 30 min |
| [E. Access controls](#e-access-controls-14) | Only your own tickets are visible | 15 min |
| [F. Behavior](#f-behavior) | Business logic (status, timer, validations) | 15 min |
| [G. Service](#g-service) | OData V4 service `ZUI_DD_O4` | 10 min |
| [H. Defaults and smoke test](#h-defaults-and-smoke-test) | Value lists, projects, end-to-end test | 10 min |
| [I. Connect the app](#i-connect-the-react-app) | React app against SAP on your PC | 10 min |
| [J. Deploy](#j-deploy-as-bsp-zdd_app) | App in SAP at `/sap/bc/ui5_ui5/sap/zdd_app/` | 15 min |
| [K. Troubleshooting](#k-troubleshooting) | Typical errors and fixes | – |

All objects are created as **local objects (package `$TMP`)**, so no transport request is needed. Moving them to a real package later is described in [docs/abapgit.md](abapgit.md).

---

## A. Preparation

- [ ] **Eclipse with ADT** connected to the S/4HANA 2025 system (SAP_BASIS 816) and the client where DevDesk should live.
- [ ] **SAP GUI** for SNRO, SE38 and the UI5 upload programs.
- [ ] **Authorizations:**
  - S_DEVELOP (create and activate objects)
  - S_NUMBER (number range maintenance)
  - S_SERVICE / `/IWFND/V4_ADMIN` (publishing the service, if ADT can't publish)
- [ ] **Source files:** clone or download https://github.com/Himanshu2214/DevDesk. All SAP sources are in the `abap/` folder:

  | Folder | Contents |
  |---|---|
  | `abap/tables/` | 10 × `*.tabl.ddl` |
  | `abap/cds/` | 18 × `*.ddls.asddls` |
  | `abap/dcl/` | 14 × `*.dcls.asdcls` |
  | `abap/bdef/` | 2 × `*.bdef.asbdef` |
  | `abap/classes/` | behavior pool (2 files) + smoke test |
  | `abap/srvd/` | service definition |
  | `abap/reports/` | `ZDD_SETUP` |

**How to paste a source in ADT** (the same for every object): create the object with the wizard, select everything in the editor (`Ctrl+A`), paste the file content (`Ctrl+V`), save (`Ctrl+S`) and activate (`Ctrl+F3`). The wizard's template code is replaced completely.

**Package in every wizard:** enter `$TMP` (or click *Local Object*). No transport is asked for.

---

## B. Number range

Ticket numbers come from number range object `ZDD_TKT`. SNRO needs a domain for the number length.

### B1. Domain `ZDD_TKT_NO`
- [ ] ADT: *File → New → Other ABAP Repository Object → Dictionary → Domain* (or SE11 → Domain)
  - Name `ZDD_TKT_NO`, description `DevDesk ticket number`, package `$TMP`
  - Data type **NUMC**, length **8**
- [ ] Activate.

### B2. Number range object `ZDD_TKT`
- [ ] SAP GUI → transaction **SNRO** → object `ZDD_TKT` → **Create**:
  - Short text `DevDesk`, long text `DevDesk ticket numbers`
  - Number length domain `ZDD_TKT_NO`
  - To-year flag: **off**
  - Warning %: `90`
- [ ] Menu *Edit → Set-up buffering → **No buffering*** (numbers stay consecutive).
- [ ] Save, choose **Local object**.

### B3. Interval
- [ ] SNRO → `ZDD_TKT` → **Intervals** → *Change intervals* → **Insert line**:
  - No. `01`, From `00001001`, To `99999999`, Ext. **off**
- [ ] Save.

✔ **Check:** SNRO → Intervals shows interval 01 with current number 0 (or empty).

---

## C. Tables (10)

ADT: *File → New → Other ABAP Repository Object → Dictionary → **Database Table***. Use the name, then paste the file. The order doesn't matter.

| ✓ | Table | File | Description |
|---|---|---|---|
| [ ] | `ZDD_TKT` | `tables/zdd_tkt.tabl.ddl` | Ticket |
| [ ] | `ZDD_ACC` | `tables/zdd_acc.tabl.ddl` | Acceptance criterion |
| [ ] | `ZDD_CHK` | `tables/zdd_chk.tabl.ddl` | Release checklist item |
| [ ] | `ZDD_TEST` | `tables/zdd_test.tabl.ddl` | Test case |
| [ ] | `ZDD_WLOG` | `tables/zdd_wlog.tabl.ddl` | Work log entry |
| [ ] | `ZDD_NOTE` | `tables/zdd_note.tabl.ddl` | Comment |
| [ ] | `ZDD_EVENT` | `tables/zdd_event.tabl.ddl` | Event (activity / inbox) |
| [ ] | `ZDD_PROJECT` | `tables/zdd_project.tabl.ddl` | Projects |
| [ ] | `ZDD_VALUE` | `tables/zdd_value.tabl.ddl` | Value lists |
| [ ] | `ZDD_CONFIG` | `tables/zdd_config.tabl.ddl` | Configuration |

✔ **Check:** SE11 → each table shows status *active*. The admin fields (`created_by`, `local_last_changed`, …) use the standard data elements `ABP_CREATION_USER` and so on, so no own data elements are needed.

*Optional:* to maintain `ZDD_PROJECT`, `ZDD_VALUE` and `ZDD_CONFIG` in SM30, generate a maintenance dialog in **SE54** (function group, e.g. `ZDD_MAINT`, also `$TMP`). Report `ZDD_SETUP` (part H) fills them anyway.

---

## D. CDS views (18)

ADT: *File → New → Other ABAP Repository Object → Core Data Services → **Data Definition***. Enter the name and description, click *Next*, choose any template, *Finish*, then replace the code with the file.

The **order matters**. Views that reference each other must be activated together.

### D1. Helpers – create and activate one by one
| ✓ | Name | File |
|---|---|---|
| [ ] | `ZI_DD_TicketHours` | `cds/zi_dd_tickethours.ddls.asddls` |
| [ ] | `ZI_DD_Project` | `cds/zi_dd_project.ddls.asddls` |
| [ ] | `ZI_DD_Value` | `cds/zi_dd_value.ddls.asddls` |
| [ ] | `ZA_DD_StatusParam` | `cds/za_dd_statusparam.ddls.asddls` (template: *Define Abstract Entity*) |

### D2. Business object – create all seven, then activate together
| ✓ | Name | File |
|---|---|---|
| [ ] | `ZR_DD_Ticket` | `cds/zr_dd_ticket.ddls.asddls` |
| [ ] | `ZR_DD_Acceptance` | `cds/zr_dd_acceptance.ddls.asddls` |
| [ ] | `ZR_DD_ChecklistItem` | `cds/zr_dd_checklistitem.ddls.asddls` |
| [ ] | `ZR_DD_TestCase` | `cds/zr_dd_testcase.ddls.asddls` |
| [ ] | `ZR_DD_Worklog` | `cds/zr_dd_worklog.ddls.asddls` |
| [ ] | `ZR_DD_Note` | `cds/zr_dd_note.ddls.asddls` |
| [ ] | `ZR_DD_Event` | `cds/zr_dd_event.ddls.asddls` |

- [ ] Save all seven (don't activate yet), then **Activate all**: `Ctrl+Shift+F3` → select all seven → *Activate*.

> The root view has compositions to the children and the children point back with `association to parent`. Activated one at a time, each fails because the other doesn't exist yet.

### D3. Projections – create all seven, then activate together
| ✓ | Name | File |
|---|---|---|
| [ ] | `ZC_DD_Ticket` | `cds/zc_dd_ticket.ddls.asddls` |
| [ ] | `ZC_DD_Acceptance` | `cds/zc_dd_acceptance.ddls.asddls` |
| [ ] | `ZC_DD_ChecklistItem` | `cds/zc_dd_checklistitem.ddls.asddls` |
| [ ] | `ZC_DD_TestCase` | `cds/zc_dd_testcase.ddls.asddls` |
| [ ] | `ZC_DD_Worklog` | `cds/zc_dd_worklog.ddls.asddls` |
| [ ] | `ZC_DD_Note` | `cds/zc_dd_note.ddls.asddls` |
| [ ] | `ZC_DD_Event` | `cds/zc_dd_event.ddls.asddls` |

- [ ] **Activate all** together (`Ctrl+Shift+F3`).

✔ **Check:** open `ZR_DD_Ticket` and press `F8` (Data Preview). An empty result is fine; there must be no error. Until the access controls exist you may see a warning "no access control".

---

## E. Access controls (14)

ADT: *File → New → Other ABAP Repository Object → Core Data Services → **Access Control***. The name is the same as the view. Paste the file.

| ✓ | Access control | File |
|---|---|---|
| [ ] | `ZR_DD_Ticket` | `dcl/zr_dd_ticket.dcls.asdcls` |
| [ ] | `ZR_DD_Acceptance` | `dcl/zr_dd_acceptance.dcls.asdcls` |
| [ ] | `ZR_DD_ChecklistItem` | `dcl/zr_dd_checklistitem.dcls.asdcls` |
| [ ] | `ZR_DD_TestCase` | `dcl/zr_dd_testcase.dcls.asdcls` |
| [ ] | `ZR_DD_Worklog` | `dcl/zr_dd_worklog.dcls.asdcls` |
| [ ] | `ZR_DD_Note` | `dcl/zr_dd_note.dcls.asdcls` |
| [ ] | `ZR_DD_Event` | `dcl/zr_dd_event.dcls.asdcls` |
| [ ] | `ZC_DD_Ticket` | `dcl/zc_dd_ticket.dcls.asdcls` |
| [ ] | `ZC_DD_Acceptance` | `dcl/zc_dd_acceptance.dcls.asdcls` |
| [ ] | `ZC_DD_ChecklistItem` | `dcl/zc_dd_checklistitem.dcls.asdcls` |
| [ ] | `ZC_DD_TestCase` | `dcl/zc_dd_testcase.dcls.asdcls` |
| [ ] | `ZC_DD_Worklog` | `dcl/zc_dd_worklog.dcls.asdcls` |
| [ ] | `ZC_DD_Note` | `dcl/zc_dd_note.dcls.asdcls` |
| [ ] | `ZC_DD_Event` | `dcl/zc_dd_event.dcls.asdcls` |

- [ ] Activate all 14 together. Create the `ZR_` ones first; the `ZC_` ones inherit from them.

✔ **Check:** the "no access control" warnings on the views are gone.

---

## F. Behavior

### F1. Behavior definition `ZR_DD_Ticket`
- [ ] In the Project Explorer, right-click data definition `ZR_DD_Ticket` → **New Behavior Definition**. Implementation type **Managed**, package `$TMP`.
- [ ] Replace the content with `bdef/zr_dd_ticket.bdef.asbdef` and save. **Don't activate yet.**

### F2. Behavior pool `ZBP_R_DD_TICKET`
- [ ] In the BDEF, the first line is underlined: *class zbp_r_dd_ticket not found*. Put the cursor on it and press **`Ctrl+1`** → *Create behavior implementation class zbp_r_dd_ticket* → package `$TMP`.
- [ ] In the new class:
  - Tab **Global Class**: replace with `classes/zbp_r_dd_ticket.clas.abap`
  - Tab **Local Types**: replace with `classes/zbp_r_dd_ticket.clas.locals_imp.abap`
- [ ] **Activate all** (`Ctrl+Shift+F3`): select the BDEF and the class together → *Activate*.

### F3. Projection behavior `ZC_DD_Ticket`
- [ ] Right-click data definition `ZC_DD_Ticket` → **New Behavior Definition** (implementation type *Projection*).
- [ ] Replace with `bdef/zc_dd_ticket.bdef.asbdef`, then activate.

✔ **Check:** both behavior definitions and the class are active, with no errors in the *Problems* view.

---

## G. Service

### G1. Service definition `ZUI_DD`
- [ ] ADT: *New → Other ABAP Repository Object → Business Services → **Service Definition*** → name `ZUI_DD`, description `DevDesk`.
- [ ] Replace with `srvd/zui_dd.srvd.srvdsrv`, then activate.

### G2. Service binding `ZUI_DD_O4`
- [ ] Right-click `ZUI_DD` → **New Service Binding**:
  - Name `ZUI_DD_O4`, description `DevDesk OData V4`
  - Binding type **OData V4 – UI**
  - Service definition `ZUI_DD`
- [ ] Activate, then click **Publish** in the binding editor.
  - If *Publish* is greyed out or fails: SAP GUI → **`/IWFND/V4_ADMIN`** → *Publish Service Groups* → system alias `LOCAL` → *Get Service Groups* → service group `ZUI_DD_O4` → *Publish Service Groups*.

✔ **Check:**
- The binding shows the service URL, for example `/sap/opu/odata4/sap/zui_dd_o4/srvd/sap/zui_dd/0001/`.
- Open `<host>:<port>` + that URL + `$metadata?sap-client=<client>` in the browser. You should see the entity sets `Ticket`, `Acceptance`, `ChecklistItem`, `TestCase`, `Worklog`, `Note`, `TicketEvent`, `Project` and `ValueList`, and the actions `setStatus`, `startTimer` and `stopTimer`.

---

## H. Defaults and smoke test

### H1. Report `ZDD_SETUP`
- [ ] ADT: *New → ABAP Program* `ZDD_SETUP` (or SE38), package `$TMP`.
- [ ] Paste `reports/zdd_setup.prog.abap`, activate, run with **F8**.
- [ ] Leave *P_PROJ* ticked. *P_RESET* is only for overwriting later changes.

✔ **Check:** the output shows "ZDD_VALUE: 35 of 35 entries written", "ZDD_CONFIG: 3 of 3", "ZDD_PROJECT: 5 entries written". The five projects are examples; adjust them to your own work (SM30 or SE16N on `ZDD_PROJECT`).

### H2. Smoke test `ZCL_DD_SMOKE_TEST`
- [ ] ADT: *New → ABAP Class* `ZCL_DD_SMOKE_TEST`, package `$TMP`.
- [ ] Paste `classes/zcl_dd_smoke_test.clas.abap`, activate.
- [ ] Press **F9** (*Run as ABAP Application (Console)*).

✔ **Check:** the console shows

```
1. Ticket created
2. setStatus PROG OK
3. Timer, work log and comment OK
4. TK-1001: status PROG, priority 3, due <today+7>, assignee <you>
   events 1 (expect 1), checklist items 6 (expect 6 after ZDD_SETUP), work log 2 entries / 1.75 h ..., test result OPEN (expect OPEN)
5. Test ticket deleted (the ticket number stays used)
```

If a step says FAILED, see [K. Troubleshooting](#k-troubleshooting). To keep the test ticket and look at it, set `gc_delete_afterwards = abap_false` in the class.

---

## I. Connect the React app

On your PC, in the `frontend/` folder of the repository:

- [ ] Install Node.js 20 or newer, then run `npm install` once.
- [ ] Copy `.env.sap.example` to **`.env.sap.local`**. This file is never committed. Fill it in:
  ```
  VITE_BACKEND=sap
  VITE_SERVICE_URL=/sap/opu/odata4/sap/zui_dd_o4/srvd/sap/zui_dd/0001/
  VITE_SAP_TARGET=https://<host>:<port>
  VITE_SAP_CLIENT=<client>
  ```
- [ ] Run `npm run dev:sap` and open http://localhost:5181. The browser asks for your SAP user and password.

✔ **Check:**
- The sidebar shows **SAP** instead of MOCK.
- Create a ticket with `C`, change its status on the board, and log time.
- In SE16N, `ZDD_TKT` and `ZDD_EVENT` contain the new rows.

---

## J. Deploy as BSP `ZDD_APP`

- [ ] In `frontend/`, run `npm run build`. This creates `frontend/dist/` with `index.html` and one JS and one CSS file; fonts are inlined.
- [ ] SAP GUI → SE38 → **`/UI5/UI5_REPOSITORY_LOAD`**:
  - Name of UI5 application: `ZDD_APP`
  - Choose *Upload*, then select the folder `frontend/dist`
  - Description `DevDesk`, package **`$TMP`**
  - Execute and confirm the file list.
- [ ] SE38 → **`/UI5/APP_INDEX_CALCULATE`** → single application `ZDD_APP` → execute.
- [ ] Open `https://<host>:<port>/sap/bc/ui5_ui5/sap/zdd_app/index.html?sap-client=<client>`.

✔ **Check:** DevDesk opens with your SAP login, and the sidebar shows **SAP**.

*Updating later:* run `npm run build`, then `/UI5/UI5_REPOSITORY_LOAD` again (same name; it replaces the files) and `/UI5/APP_INDEX_CALCULATE`. Hard-refresh the browser with `Ctrl+F5`.

*Optional launchpad tile:* `/UI2/FLPD_CUST` → *Static App Launcher* with target URL `/sap/bc/ui5_ui5/sap/zdd_app/index.html`, as for ZPCH_APP.

---

## K. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Table: *"Field name … is reserved"* | Name is on the DDIC reserved-word list (TRESE) | Rename the field in the table, the CDS view and the BDEF mapping. Note it in [abap/README.md](../abap/README.md) → *Fixes during activation* |
| CDS: *"Entity … does not exist"* while activating `ZR_DD_Ticket` | Views were activated one by one | Create all seven `ZR_` (or `ZC_`) views first, then **Activate all** together |
| CDS: error on `ltrim` / `concat` in `ZR_DD_Ticket` (field `TicketId`) | Function or cast not accepted on this release | Replace the line with `ticket_no as TicketId,` and format `TK-` in the app (`TicketId` is only for display) |
| BDEF: *"Class zbp_r_dd_ticket not found"* | Class not created yet | `Ctrl+1` on the message → create the class (step F2) |
| BDEF and class activate with errors on each other | Activated separately | Activate the BDEF and the class together |
| Smoke test step 1: *"Create FAILED"* | Validation: project or value lists missing | Run `ZDD_SETUP` (H1) first; use a project that exists in `ZDD_PROJECT` |
| Smoke test: *"Number range … not found"* | SNRO object or interval missing | Check B2 and B3 (interval `01`) |
| Short dump `CX_RAP_HANDLER_NOT_IMPLEMENTED` | An action was added on a child entity | Keep actions on the root (`Ticket`) only, the same lesson as ZPCH |
| `$metadata` → 403 / 404 | Binding not published | G2: *Publish*, or `/IWFND/V4_ADMIN` |
| App: red toast *"412 … changed in the meantime"* | ETag mismatch (changed in another tab) | The app reloads the ticket; repeat the change |
| App: *"Could not load data"* with 401 | Not logged on, or wrong client | Add `?sap-client=<client>` to the URL; log on again |
| App: 403 *CSRF token validation failed* | Session expired | Reload the page; the app fetches a new token automatically |
| App opens without fonts or icons | Old cached files | `Ctrl+F5`; check that `/UI5/APP_INDEX_CALCULATE` ran |
| Data gone after a client copy | Tables are application data in the DEV client | Agree with Basis to exclude `ZDD_*` from client refreshes, or back them up |

---

## Done – what's next

- [ ] Tick the activation fixes, if any, in [abap/README.md](../abap/README.md) → *Fixes during activation*, and copy them back into the source files so GitHub stays in sync.
- [ ] Optional: install **abapGit** and move the objects to a local package `$ZDD`. From then on, SAP pushes the code to GitHub directly ([docs/abapgit.md](abapgit.md)).
- Phase 2 (transports, object registry, knowledge base, insights) is designed in [docs/backend-design.md](backend-design.md).
