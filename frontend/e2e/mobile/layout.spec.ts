// Mobile and responsive audit: every main screen at six viewport sizes. For each it saves a screenshot and checks
//  - the page itself never scrolls sideways (hard failure)
//  - elements sticking out past the right edge outside a scrolling area (listed, soft failure)
//  - tap targets smaller than 24 × 24 px on phone sizes (listed in the report, soft failure)
// Wide content that scrolls inside its own area (board columns, Gantt, calendar week) is allowed by design.
import { expect, test, type Page } from '@playwright/test';
import { open } from '../helpers';

const SIZES = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]] as const;
const SCREENS: { name: string; route: string; prepare?: (p: Page) => Promise<void> }[] = [
  { name: 'dashboard', route: 'home' },
  { name: 'ticket-board', route: 'list/active' },
  { name: 'ticket-list', route: 'list/active', prepare: async p => { await p.getByRole('button', { name: 'List', exact: true }).click() } },
  { name: 'ticket-detail', route: 'list/active', prepare: async p => { await p.locator('a[href^="#ticket/"]').first().click(); await expect(p.locator('.tp-title')).toBeVisible() } },
  { name: 'new-ticket-dialog', route: 'list/active', prepare: async p => { await p.getByRole('button', { name: 'New ticket', exact: true }).first().click(); await expect(p.locator('.modal')).toBeVisible() } },
  { name: 'calendar', route: 'calendar', prepare: async p => { await expect(p.locator('.fc')).toBeVisible() } },
  { name: 'timeline', route: 'timeline' },
  { name: 'knowledge', route: 'kb' },
  { name: 'timesheet', route: 'timesheet' },
  { name: 'insights', route: 'insights' },
  { name: 'inbox', route: 'inbox' },
  { name: 'lists', route: 'lists' },
];

interface Finding { overflowX: number; outside: string[]; small: string[] }
/** measured in the page: sideways overflow, elements past the right edge (not inside a scroller), small tap targets */
const measure = (page: Page, phone: boolean) => page.evaluate((phone): Finding => {
  const w = innerWidth;
  const label = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)}"`;
  const inScroller = (e: Element) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true } return false };
  const visible = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 };
  // cheap position check first; styles only for the few elements that actually reach past the edge (pages with a
  // diagram have thousands of SVG nodes)
  const outside = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > w + 1)
    .filter(e => !(e.parentElement && e.parentElement.getBoundingClientRect().right > w + 1) && !e.closest('svg') && visible(e) && !inScroller(e)
      && !e.closest('.side:not(.open)')).slice(0, 12).map(label);
  const small = phone ? [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button], [role=tab]')]
    .filter(e => { if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.right > 0 && r.left < w && r.top < innerHeight && r.bottom > 0 && (r.width < 24 || r.height < 24) })
    .slice(0, 15).map(e => { const r = e.getBoundingClientRect(); return `${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}` }) : [];
  return { overflowX: document.documentElement.scrollWidth - w, outside, small };
}, phone);

for (const [w, h] of SIZES) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: w < 768, isMobile: w < 768 });
    for (const s of SCREENS) {
      test(s.name, async ({ page }, info) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        await open(page, s.route);
        await s.prepare?.(page);
        await page.waitForLoadState('networkidle');
        const shot = await page.screenshot({ fullPage: false });
        await info.attach(`${w}x${h}-${s.name}`, { body: shot, contentType: 'image/png' });
        const f = await measure(page, w < 768);
        if (f.outside.length || f.small.length) await info.attach('findings', { body: JSON.stringify(f, null, 2), contentType: 'application/json' });
        expect(errors, 'no script errors').toEqual([]);
        expect(f.overflowX, 'the page itself must not scroll sideways').toBeLessThanOrEqual(1);
        expect.soft(f.outside, 'elements sticking out past the right edge').toEqual([]);
        expect.soft(f.small, 'tap targets smaller than 24 × 24 px').toEqual([]);
      });
    }
  });
}
