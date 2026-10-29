# abapGit and abaplint for DevDesk

## abaplint (automatic, on GitHub)

On every push, `.github/workflows/ci.yml` builds the frontend and runs **abaplint** on `abap/` with the settings in `abaplint.json`. Results are on the repository's **Actions** tab.

- **Version:** syntax `v758`, the newest abaplint knows; your system is 816.
- **Dependencies:** the definitions of SAP standard objects are loaded from `abaplint/deps`.
- **Checks that stay on:** obsolete statements, `CHECK` outside loops, `SELECT *`, identical branches, non-ASCII characters, naming (RAP `lhc_*` handler classes and `ZBP_*` behavior pools are accepted), empty statements, and more.

**Switched off for now (tool gaps, not code problems):**

| Rule | Why |
|---|---|
| `parser_error`, `check_syntax`, `unknown_types` | abaplint 2.113 doesn't fully parse RAP EML (`MODIFY ENTITIES … \_Event`, `TYPE TABLE FOR UPDATE …\\Ticket`, `RESPONSE FOR REPORTED LATE`) |
| `check_ddic`, `tabl_enhancement_category` | tables are in the source format (`define table …`); abaplint reads abapGit's XML format only |
| `cds_parser_error` | its CDS parser doesn't know `ltrim()` and `count(*)` |
| formatting rules (`keyword_case`, `line_length`, alignment …) | ABAP Cleaner in ADT does the formatting; `no_prefixes` and `check_comments` contradict the Gulbrandsen style |

Once the objects come from abapGit (XML tables, see below), switch `check_ddic` and `check_syntax` back on in `abaplint.json` for full checks.

Run it locally:

```bash
npx @abaplint/cli abaplint.json
```

## abapGit (SAP ↔ GitHub without copy-paste)

abapGit serializes ABAP objects into files and pushes or pulls them to and from Git. Today, `abap/` holds hand-written sources that you paste into ADT; with abapGit, SAP becomes the source and GitHub gets exactly what is active in the system.

### 1. Install (once per system)

1. Download the standalone version from https://abapgit.org (the single file `zabapgit_standalone.prog.abap`).
2. SE38: create report `ZABAPGIT_STANDALONE` as a local object, paste the file, activate, and run it.

### 2. Put DevDesk in a package abapGit can use

abapGit cannot work with `$TMP`. Create a **local package `$ZDD`** (SE21 or ADT; local packages start with `$`, so no transport is needed), then move the DevDesk objects into it: in ADT, right-click → *Change Package Assignment*, or SE03 → *Change Object Directory Entries*.

### 3. Connect the repository

- **Online** (SAP reaches github.com directly): *New Online* → URL `https://github.com/Himanshu2214/DevDesk.git`, package `$ZDD`, folder logic *Prefix*, starting folder `/src/`. Pushing needs a GitHub personal access token as the password; keep it in abapGit's login dialog only, never in code.
- **Offline** (the company network blocks github.com from SAP, which is common): *New Offline* → package `$ZDD` → *Export* as ZIP. Unzip it into `src/` in your local clone and commit from the PC as usual.

### 4. After the first export

abapGit writes its own format to `src/` (`.tabl.xml`, `.ddls.asddls`, `.clas.abap` plus `.clas.xml`, and so on). From then on:

- `src/` is the source of truth; keep `abap/` only until the first export is checked, then delete it.
- In `abaplint.json`, change `global.files` to `/src/**/*.*` and switch `check_ddic`, `check_syntax` and `unknown_types` back on.
- Commit messages can reference tickets (`TK-1042: add GST split`), so the history shows which change belongs to which ticket.
