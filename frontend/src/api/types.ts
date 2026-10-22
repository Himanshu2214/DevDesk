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
  _Acceptance?: Acceptance[];
  _Test?: TestCase[];
  _Checklist?: ChecklistItem[];
  _Worklog?: Worklog[];
  _Note?: Note[];
  _Event?: TicketEvent[];
}

export interface Project { Project: string; Name: string; Color: string; SortOrder: number; IsActive: boolean }
export interface ValueItem { ListType: string; Code: string; Text: string; SortOrder: number; Color: string; WipLimit: number; IsActive: boolean }
export interface User { id: string; fullName: string }

export interface NewTicket {
  Title: string; Description: string; Priority: string; Project: string; Area: string; Tech: string; TicketType: string;
  Environment: string; Requester: string; Reference: string; DueDate: string; EstimateHours: number;
  acceptance: string[]; status: Status;
}

/** Children that can be created under a ticket, by navigation property */
export type ChildNav = '_Acceptance' | '_Test' | '_Checklist' | '_Worklog' | '_Note';
/** Entity sets of the children (for PATCH / DELETE) */
export type ChildSet = 'Acceptance' | 'TestCase' | 'ChecklistItem' | 'Worklog' | 'Note' | 'TicketEvent';
export const CHILD_KEY: Record<ChildSet, string> = {
  Acceptance: 'AccUUID', TestCase: 'TestUUID', ChecklistItem: 'ItemUUID', Worklog: 'WorklogUUID', Note: 'NoteUUID', TicketEvent: 'EventUUID',
};

/** Everything the UI needs from a backend. Implemented by the OData client (SAP) and the in-browser mock. */
export interface Api {
  readonly kind: 'sap' | 'mock';
  user(): Promise<User>;
  listProjects(): Promise<Project[]>;
  listValues(): Promise<ValueItem[]>;
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
}
