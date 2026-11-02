// Types mirror the OData V4 service ZUI_DD_O4 (CDS ZC_DD_*). Field names are the CDS element names.

export type Status = 'BACKLOG' | 'TODO' | 'PROG' | 'TEST' | 'BLOCK' | 'DONE';
export type TestResult = 'OPEN' | 'PASS' | 'FAIL';

export interface Acceptance { AccUUID: string; TicketUUID: string; SortOrder: number; Text: string; etag?: string }
export interface ChecklistItem { ItemUUID: string; TicketUUID: string; SortOrder: number; Category: string; Text: string; IsDone: boolean; etag?: string }
export interface TestCase {
  TestUUID: string; TicketUUID: string; SortOrder: number; TestName: string; TestSteps: string; Expected: string; Actual: string;
  TestResult: TestResult; TestedAt: string | null; TestedBy: string; etag?: string;
}
export interface Worklog {
  WorklogUUID: string; TicketUUID: string; WorkDate: string; Hours: number; Activity: string; CommentText: string;
  EntrySource: string; CreatedBy: string; CreatedAt: string | null; etag?: string;
  _Ticket?: Pick<Ticket, 'TicketUUID' | 'TicketId' | 'Title' | 'Status' | 'EstimateHours'>;
}
export interface Note { NoteUUID: string; TicketUUID: string; Text: string; CreatedBy: string; CreatedAt: string | null; etag?: string }
export interface TicketEvent {
  EventUUID: string; TicketUUID: string; EventKind: string; StatusFrom: string; StatusTo: string; Text: string;
  EventAt: string | null; EventBy: string; IsRead: boolean; etag?: string;
  _Ticket?: Pick<Ticket, 'TicketUUID' | 'TicketId' | 'Title' | 'Status'>;
}

/** Uploader: who stored the file (standalone: the file lives in their storage folder) */
export interface Attachment { AttUUID: string; TicketUUID: string; FileName: string; MimeType: string; FileSize: number; CreatedBy: string; CreatedAt: string | null; Uploader?: string; etag?: string }
export type ChangeKind = 'NEW' | 'CHANGE' | 'CHECK';
export interface ObjectLink { LinkUUID: string; TicketUUID: string; ObjectUUID: string; ChangeKind: ChangeKind; NoteText: string; etag?: string }

/* ---------- phase 2: transports, object registry, knowledge base ---------- */
/** Tracker column, calculated in ZR_DD_Transport */
export type Phase = 'DEV' | 'QA' | 'PRD' | 'FAILED';
export interface TransportDependency { DepUUID: string; TransportUUID: string; DependsOn: string; NoteText: string; etag?: string }
export interface Transport {
  TransportUUID: string; TrKorr: string; TicketUUID: string | null; TrText: string; TrKind: string; TrOwner: string;
  ReleasedOn: string | null; QaRc: number; QaImportedAt: string | null; PrdRc: number; PrdImportedAt: string | null; Phase: Phase;
  TestEvidence: string; DeployNotes: string; RollbackNotes: string; CreatedBy: string; CreatedAt: string | null; LastChangedAt: string | null;
  etag?: string; _Dependency: TransportDependency[];
}
export interface ObjectDependency { DepUUID: string; ObjectUUID: string; UsesObjectUUID: string; DepKind: string; NoteText: string; etag?: string }
export interface TechObject {
  ObjectUUID: string; ObjectType: string; ObjectName: string; Description: string; PackageName: string; Project: string; Notes: string;
  CreatedBy: string; CreatedAt: string | null; LastChangedAt: string | null; etag?: string; _Dependency: ObjectDependency[];
}
export type ArticleType = 'SNIP' | 'FIX' | 'API' | 'CONF' | 'DECI';
export interface ArticleLink { LinkUUID: string; ArticleUUID: string; TicketUUID: string | null; ObjectUUID: string | null; etag?: string }
export interface Article {
  ArticleUUID: string; ArticleNo: string; ArticleId: string; ArticleType: ArticleType; Title: string; Tags: string;
  ErrorText: string; RootCause: string; FixLocation: string; FixText: string; TestNote: string;
  CodeText: string; CodeLang: string; NoteText: string;
  HttpMethod: string; Endpoint: string; RequestBody: string; ResponseBody: string; ResponseCodes: string; AuthReference: string;
  StepsText: string; ContextText: string; DecisionText: string; Consequences: string;
  CreatedBy: string; CreatedAt: string | null; LastChangedAt: string | null; etag?: string; _Link: ArticleLink[];
}
export type RootSet = 'Transport' | 'TechObject' | 'Article';
export type SubSet = 'TransportDependency' | 'ObjectDependency' | 'ArticleLink';
export const ROOT_KEY: Record<RootSet, string> = { Transport: 'TransportUUID', TechObject: 'ObjectUUID', Article: 'ArticleUUID' };
export const SUB_KEY: Record<SubSet, string> = { TransportDependency: 'DepUUID', ObjectDependency: 'DepUUID', ArticleLink: 'LinkUUID' };
export const SUB_NAV: Record<RootSet, '_Dependency' | '_Link'> = { Transport: '_Dependency', TechObject: '_Dependency', Article: '_Link' };
type Entity = { etag?: string } & Record<string, unknown>;

export interface Ticket {
  TicketUUID: string;
  TicketNo: string;
  TicketId: string;
  Title: string;
  Description: string;
  Status: Status;
  Priority: string;           // '1' Urgent … '4' Low
  Project: string;
  ProjectName: string;
  Area: string;
  Tech: string;
  TicketType: string;
  Environment: string;
  Assignee: string;
  Requester: string;
  Reference: string;
  DueDate: string | null;     // YYYY-MM-DD
  /** planned start (Timeline); standalone and sample-data mode only */
  PlannedStart?: string | null;
  EstimateHours: number;
  LoggedHours: number;
  StatusChangedAt: string | null;
  ClosedAt: string | null;
  TimerStartedAt: string | null;
  IsOverdue: boolean;
  CreatedBy: string;
  CreatedAt: string | null;
  LastChangedAt: string | null;
  etag?: string;
  /** standalone only: who shared this ticket with you, and whether by itself or with its project; Shares = how many
   *  people you shared your ticket with */
  SharedBy?: string | null;
  SharedVia?: 'ticket' | 'project' | null;
  Shares?: number;
  /** your access to it: owner, edit, comment or view (standalone; empty elsewhere = full access) */
  Access?: 'owner' | 'edit' | 'comment' | 'view' | null;
  /** someone else changed or commented since you last opened it */
  ChangedByOthers?: boolean;
  _Acceptance?: Acceptance[];
  _Test?: TestCase[];
  _Checklist?: ChecklistItem[];
  _Worklog?: Worklog[];
  _Note?: Note[];
  _Event?: TicketEvent[];
  _Attachment?: Attachment[];
  _ObjectLink?: ObjectLink[];
}

/** SharedBy: set when someone else shared this project with you; Members: how many people you shared it with (standalone only) */
export interface Project { Project: string; Name: string; Color: string; SortOrder: number; IsActive: boolean; SharedBy?: string | null; Members?: number }
export type AccessLevel = 'view' | 'comment' | 'edit';
export interface ProjectMember { member_id: string; email: string; name: string; since: string; access?: AccessLevel; status?: 'active' | 'pending' }
/** an invitation waiting for you: a ticket or project from outside your organization, or an organization to join */
export interface Invitation { kind: 'ticket' | 'project' | 'org'; ref: string; title: string; detail: string; from_name: string; access: string; since: string }
export interface AppNotification { NotifUUID: string; Kind: string; Title: string; Body: string; Link: string; CreatedAt: string; ReadAt: string | null }
export interface OrgMember { userId: string; email: string; name: string; role: 'admin' | 'member'; since: string; me: boolean }
export interface Organization { id: string; name: string; onlyInternal: boolean; admin: boolean; members: OrgMember[]; invites: { email: string; role: string; since: string }[] }
/** one recorded change to a ticket field (standalone) */
export interface TicketChange { ChangeUUID: string; Field: string; OldValue: unknown; NewValue: unknown; ChangedAt: string; By: string; Mine: boolean }
export interface ValueItem { ListType: string; Code: string; Text: string; SortOrder: number; Color: string; WipLimit: number; IsActive: boolean }
/** email / photo (Google picture) / avatar (chosen look) are filled in standalone mode */
export interface User { id: string; fullName: string; email?: string; photo?: string; avatar?: string; onboarded?: boolean }

export interface NewTicket {
  Title: string; Description: string; Priority: string; Project: string; Area: string; Tech: string; TicketType: string;
  Environment: string; Requester: string; Reference: string; DueDate: string; EstimateHours: number;
  acceptance: string[]; status: Status;
}

/** What changed, for live updates: ticket data (incl. work log, notes, …), transports/objects/articles, or templates */
export type LiveArea = 'tickets' | 'p2' | 'templates';

/** Timeline dependency: FromTicket must finish before ToTicket starts */
export interface TicketLink { LinkUUID: string; FromTicket: string; ToTicket: string }

/** Prefilled new-ticket form; DueDays = due date as days from the day the ticket is created */
export type TemplateData = Partial<Omit<NewTicket, 'acceptance' | 'DueDate' | 'Reference'>> & { DueDays?: number | null; acceptance?: string[] };
export interface TicketTemplate { TemplateUUID: string; Name: string; Data: TemplateData; Starter?: boolean }

/** Children that can be created under a ticket, by navigation property */
export type ChildNav = '_Acceptance' | '_Test' | '_Checklist' | '_Worklog' | '_Note' | '_Attachment' | '_ObjectLink';
/** Entity sets of the children (for PATCH / DELETE) */
export type ChildSet = 'Acceptance' | 'TestCase' | 'ChecklistItem' | 'Worklog' | 'Note' | 'TicketEvent' | 'Attachment' | 'ObjectLink';
export const CHILD_KEY: Record<ChildSet, string> = {
  Acceptance: 'AccUUID', TestCase: 'TestUUID', ChecklistItem: 'ItemUUID', Worklog: 'WorklogUUID', Note: 'NoteUUID', TicketEvent: 'EventUUID',
  Attachment: 'AttUUID', ObjectLink: 'LinkUUID',
};

/** Everything the UI needs from a backend. Implemented by the OData client (SAP), the in-browser mock and Supabase (standalone). */
export interface Api {
  readonly kind: 'sap' | 'mock' | 'supabase';
  user(): Promise<User>;
  listProjects(): Promise<Project[]>;
  listValues(): Promise<ValueItem[]>;
  /** stores a (cleaned) client error for later review – standalone only; the other backends log to the console */
  logClientError?(e: { message: string; stack: string; where: string; route: string }): Promise<void>;
  /** Settings → Lists: add or change one of your own list items (types, areas, tech, activities, status names);
   *  not in SAP mode, where the lists are maintained in SAP */
  saveValue?(item: ValueItem): Promise<void>;
  listTickets(): Promise<Ticket[]>;
  /** Tickets changed after the given ISO timestamp (polling) */
  changedSince(iso: string): Promise<Ticket[]>;
  getTicket(uuid: string): Promise<Ticket>;
  createTicket(t: NewTicket): Promise<Ticket>;
  updateTicket(t: Ticket, patch: Partial<Ticket>): Promise<void>;
  deleteTicket(t: Ticket): Promise<void>;
  setStatus(t: Ticket, status: Status): Promise<void>;
  startTimer(t: Ticket): Promise<void>;
  stopTimer(t: Ticket): Promise<void>;
  createChild(t: Ticket, nav: ChildNav, data: Record<string, unknown>): Promise<void>;
  updateChild(set: ChildSet, item: { etag?: string } & Record<string, unknown>, patch: Record<string, unknown>): Promise<void>;
  deleteChild(set: ChildSet, item: { etag?: string } & Record<string, unknown>): Promise<void>;
  listEvents(top: number): Promise<TicketEvent[]>;
  listWorklog(from: string, to: string): Promise<Worklog[]>;
  /** Attachment content (not part of the ticket read) */
  downloadAttachment(a: Attachment): Promise<Blob>;
  /** All ticket ↔ object links (object page, counts) */
  listObjectLinks(): Promise<ObjectLink[]>;

  // phase 2 roots with their child (dependencies / links)
  listTransports(): Promise<Transport[]>;
  listObjects(): Promise<TechObject[]>;
  listArticles(): Promise<Article[]>;
  /** creates a root and returns its UUID */
  createRoot(set: RootSet, data: Record<string, unknown>): Promise<string>;
  updateRoot(set: RootSet, item: Entity, patch: Record<string, unknown>): Promise<void>;
  deleteRoot(set: RootSet, item: Entity): Promise<void>;
  createSub(set: RootSet, item: Entity, data: Record<string, unknown>): Promise<void>;
  deleteSub(set: SubSet, item: Entity): Promise<void>;
  markReleased(t: Transport): Promise<void>;
  recordImport(t: Transport, system: 'QA' | 'PRD', rc: number): Promise<void>;

  /** Live updates (Supabase Realtime): calls onChange when data changed on another device or tab; returns unsubscribe.
   *  Backends without push leave it out and rely on polling. */
  subscribe?(onChange: (area: LiveArea) => void, onStatus: (live: boolean) => void): () => void;

  /** Teams (standalone only): share one of your projects with another account, list / remove members, leave a shared project */
  shareProject?(project: string, email: string, access?: AccessLevel): Promise<string>;
  setProjectAccess?(project: string, memberId: string, access: AccessLevel): Promise<void>;
  /** invitations and notifications (standalone): shares from outside your organization wait for Accept / Decline */
  myInvitations?(): Promise<Invitation[]>;
  answerInvitation?(kind: Invitation['kind'], ref: string, accept: boolean): Promise<void>;
  listNotifications?(): Promise<AppNotification[]>;
  markNotificationsRead?(ids: string[]): Promise<void>;
  /** emails the person you just shared with / invited (best effort) */
  notifyEmail?(body: { kind: 'ticket' | 'project' | 'org'; ref?: string; email: string }): Promise<void>;
  /** organizations (standalone): one per account */
  myOrg?(): Promise<Organization | null>;
  createOrg?(name: string): Promise<void>;
  inviteToOrg?(email: string, role: 'admin' | 'member'): Promise<'invited' | 'no-account'>;
  cancelOrgInvite?(email: string): Promise<void>;
  setOrgMember?(userId: string, role: 'admin' | 'member'): Promise<void>;
  removeOrgMember?(userId: string): Promise<void>;
  setOrgSettings?(name: string, onlyInternal: boolean): Promise<void>;
  /** people you already share with (either direction) – suggestions while typing in the share dialogs */
  shareContacts?(): Promise<{ email: string; name: string }[]>;
  projectMembers?(project: string): Promise<ProjectMember[]>;
  unshareProject?(project: string, memberId: string): Promise<void>;
  leaveProject?(project: string): Promise<void>;
  /** Share a single ticket (standalone only): with another account, list / remove them, or leave one shared with you */
  shareTicket?(ticketUUID: string, email: string, access?: AccessLevel): Promise<string>;
  setTicketAccess?(ticketUUID: string, memberId: string, access: AccessLevel): Promise<void>;
  /** change history of a ticket, undoing one change, and marking a ticket as seen (standalone only) */
  ticketChanges?(ticketUUID: string): Promise<TicketChange[]>;
  undoTicketChange?(changeUUID: string): Promise<void>;
  markTicketSeen?(ticketUUID: string): Promise<void>;
  ticketMembers?(ticketUUID: string): Promise<ProjectMember[]>;
  unshareTicket?(ticketUUID: string, memberId: string): Promise<void>;
  leaveTicket?(ticketUUID: string): Promise<void>;
  /** everyone on a shared project (owner first) – for the avatar group */
  projectPeople?(project: string): Promise<{ name: string; email: string; is_owner: boolean; photo: string }[]>;

  /** Timeline dependencies – not in SAP mode (the SAP tables have no place for them yet) */
  listTicketLinks?(): Promise<TicketLink[]>;
  addTicketLink?(from: string, to: string): Promise<TicketLink>;
  deleteTicketLink?(id: string): Promise<void>;

  // ticket templates (your own; starters are built into the app). Same name = overwrite.
  listTemplates(): Promise<TicketTemplate[]>;
  saveTemplate(name: string, data: TemplateData): Promise<TicketTemplate>;
  deleteTemplate(id: string): Promise<void>;
}
