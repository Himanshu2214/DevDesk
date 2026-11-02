// Phone side of "approve on your phone": opened from the sign-in notification (#approve). Shows which browser is
// signing in and three numbers; tapping the one shown on that screen lets it in, anything else denies it.
import { useEffect, useState } from 'react';
import { pushCall } from '../lib/push';
import { ago } from '../lib/format';
import { Icon, Spinner } from '../components/Icons';
import { Page } from '../components/ui';

type Request = { id: string; choices: number[]; agent: string; createdAt: string };
type Result = 'approved' | 'denied' | 'wrong' | null;

export function Approve() {
  const [req, setReq] = useState<Request | null | undefined>(undefined);   // undefined = loading
  const [busy, setBusy] = useState(false), [result, setResult] = useState<Result>(null), [err, setErr] = useState('');
  const load = () => pushCall<{ request: Request | null }>('pending').then(r => setReq(r.request)).catch(e => { setErr((e as Error).message); setReq(null) });
  useEffect(() => {
    load();
    // left open on this screen: coming back to the app looks for a new request
    const back = () => { if (document.visibilityState === 'visible') { setResult(null); setErr(''); load() } };
    document.addEventListener('visibilitychange', back); return () => document.removeEventListener('visibilitychange', back);
  }, []);
  const answer = async (body: { choice?: number; deny?: boolean }) => {
    if (!req) return;
    setBusy(true); setErr('');
    try {
      const r = await pushCall<{ approved: boolean; wrongNumber: boolean }>('answer', { id: req.id, ...body });
      setResult(r.approved ? 'approved' : r.wrongNumber ? 'wrong' : 'denied');
    } catch (e) { setErr((e as Error).message) }
    setBusy(false);
  };
  const done = (icon: string, cls: string, title: string, text: string) => <>
    <span className={'approve-icon ' + cls}><Icon name={icon} size={26} /></span><h2>{title}</h2><p className="approve-who">{text}</p>
    <a className="btn" href="#home">Done</a></>;
  return <Page crumb={<b>Sign-in request</b>}>
    <div className="approve">
      {req === undefined ? <div className="sk" style={{ height: 220, borderRadius: 16 }} />
        : result === 'approved' ? done('check', 'ok', 'Approved', 'The other device is signing in now.')
        : result === 'wrong' ? done('x', 'no', 'Wrong number – denied', 'If that was you, sign in again and tap the number shown on that screen.')
        : result === 'denied' ? done('x', 'no', 'Denied', 'Nobody got in. If you did not try to sign in, change your password.')
        : !req ? <>
          <span className="approve-icon"><Icon name="phone" size={26} /></span>
          <h2>No sign-in waiting</h2>
          <p className="approve-who">{err || 'Notifications work on this device. A request shows up here when you sign in somewhere else.'}</p>
          <button className="btn" onClick={() => { setReq(undefined); load() }}><Icon name="refresh" size={14} />Check again</button></>
        : <>
          <span className="approve-icon"><Icon name="phone" size={26} /></span>
          <h2>Is this you signing in?</h2>
          <p className="approve-who">{req.agent} · {ago(req.createdAt)}. Tap the number shown on that screen.</p>
          <div className="approve-nums">{req.choices.map(n =>
            <button key={n} disabled={busy} onClick={() => answer({ choice: n })} aria-label={`Approve with number ${n}`}>{n}</button>)}</div>
          <button className="btn danger-btn" disabled={busy} onClick={() => answer({ deny: true })}>{busy ? <Spinner /> : <Icon name="x" size={14} />}No, it's not me</button>
          {err && <p className="auth-err" role="alert">{err}</p>}
        </>}
    </div>
  </Page>;
}
