import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { EngineProvider } from '../lib/engine';
import { useSession } from '../lib/session';
import { Lock } from '../components/Icons';
import { LeakActionProvider } from './useLeakAction';
import { Shell, type Mode } from './Shell';
import { Feed } from './Feed';
import { PageCheck, Pages } from './Pages';
import { Guards } from './Guards';
import { Forecast } from './Forecast';
import { Ask } from './Ask';
import { Activity } from './Activity';
import { Settings } from './Settings';

function Locked({ what, why }: { what: string; why: string }) {
  const nav = useNavigate();
  return (
    <div className="page">
      <div className="card locked">
        <span className="locked-ico"><Lock size={22} /></span>
        <h1 className="h-md">{what} is part of Pro.</h1>
        <p className="muted">{why}</p>
        <div className="locked-actions">
          <button className="btn btn-primary" onClick={() => nav('/pricing')}>Go Pro · $19/month</button>
          <button className="btn btn-quiet" onClick={() => nav('/demo')}>Try it in the demo</button>
        </div>
      </div>
    </div>
  );
}

export function AppRoot({ mode }: { mode: Mode }) {
  const session = useSession();
  if (mode === 'account') {
    if (!session.email) return <Navigate to="/signin?next=/app" replace />;
    if (!session.accountName) return <Navigate to="/connect" replace />;
  }
  const pro = mode === 'demo' || session.plan === 'pro';
  return (
    <EngineProvider running={!(mode === 'account' && session.tokenExpired)}>
      <LeakActionProvider>
        <Shell mode={mode}>
          <Routes>
            <Route index element={<Feed />} />
            <Route path="leak/:id" element={<Feed />} />
            <Route path="pages" element={<Pages />} />
            <Route path="pages/:url" element={<PageCheck />} />
            <Route path="guards" element={pro ? <Guards /> : <Locked what="Guards" why="Rules that pause leaking ad sets overnight, written for you, with a log and Undo." />} />
            <Route path="forecast" element={pro ? <Forecast /> : <Locked what="Tomorrow’s forecast" why="See which ad sets will likely miss your target cost tomorrow, before the money is spent." />} />
            <Route path="ask" element={pro ? <Ask /> : <Locked what="Ask" why="Ask “why did Tuesday cost so much?” and get an answer from your own numbers." />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings mode={mode} />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </Shell>
      </LeakActionProvider>
    </EngineProvider>
  );
}
