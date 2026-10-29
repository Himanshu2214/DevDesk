import { Page } from '../components/ui';

const TEXT: Record<string, [string, string]> = {
  insights: ['Insights', 'Progress chart, hours per week, cycle time and completion by project, area and tech. The data (status events, work log, transports) is already collected.'],
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
