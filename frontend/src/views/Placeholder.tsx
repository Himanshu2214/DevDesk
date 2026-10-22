import { Page } from '../components/ui';

const TEXT: Record<string, [string, string]> = {
  transports: ['Transports', 'Deployment tracker DEV → QA → PRD with import status, test evidence and rollback notes. Phase 2 (manual), live TMS status in phase 3.'],
  objects: ['Objects', 'Technical object registry with dependencies and the impact map. Phase 2.'],
  kb: ['Knowledge', 'Snippets, error & fix journal, API examples, config notes and design decisions, linked to tickets and objects. Phase 2.'],
  insights: ['Insights', 'Progress chart, hours per week and completion by project, area and tech. Phase 2 – the data (status events, work log) is already collected.'],
};

export function Placeholder({ route }: { route: string }) {
  const [title, text] = TEXT[route] ?? ['Not found', 'This page does not exist.'];
  return (
    <Page crumb={<b>{title}</b>}>
      <div className="home"><div className="panel" style={{ padding: '22px 24px', maxWidth: 620 }}>
        <h2 style={{ fontSize: 18 }}>{title} – coming next</h2>
        <p className="t2" style={{ fontSize: 14, lineHeight: 1.6 }}>{text}</p>
        <p className="muted">You can see how it will look in the clickable mockup (<code>mockup/index.html</code>).</p>
        <a className="btn" href="#home">Back to Home</a></div></div>
    </Page>
  );
}
