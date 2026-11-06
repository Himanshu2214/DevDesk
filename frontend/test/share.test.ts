// "Share → SLATE·SPACE" (src/lib/share.ts): how shared text becomes a new ticket.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
import { sharedToTicket } from '../src/lib/share';

describe('shared text → new ticket', () => {
  it('an email: subject is the title, the body the description, a link the reference', () => {
    expect(sharedToTicket({ subject: 'PO 4500012345 stuck in workflow', text: 'Hi,\nthe PO is stuck.\nSee https://sap.example.com/po/4500012345 for details.' })).toEqual({
      Title: 'PO 4500012345 stuck in workflow',
      Description: 'Hi,\nthe PO is stuck.\nSee https://sap.example.com/po/4500012345 for details.',
      Reference: 'https://sap.example.com/po/4500012345',
    });
  });
  it('a chat message: the first line is the title', () => {
    expect(sharedToTicket({ text: '  \nPricing condition ZPR0 missing in VA01\nfor customer 1000 since today' })).toEqual({
      Title: 'Pricing condition ZPR0 missing in VA01',
      Description: 'Pricing condition ZPR0 missing in VA01\nfor customer 1000 since today',
    });
  });
  it('just a link: the title is the address, the link the reference, no description', () => {
    expect(sharedToTicket({ text: 'https://www.example.com/note/3123456' })).toEqual({ Title: 'example.com/note/3123456', Reference: 'https://www.example.com/note/3123456' });
  });
  it('a one-liner is only the title; long titles are shortened; nothing shared opens nothing', () => {
    expect(sharedToTicket({ text: 'Check transport DEVK900123' })).toEqual({ Title: 'Check transport DEVK900123' });
    expect(sharedToTicket({ text: 'x'.repeat(200) })!.Title).toHaveLength(120);
    expect(sharedToTicket({ text: '  ', subject: '' })).toBeNull();
    expect(sharedToTicket({})).toBeNull();
  });
});
