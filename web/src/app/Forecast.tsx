import { MIN_FORECAST_ROWS } from '@shared';
import { useMoney, useSnap } from '../lib/engine';

const VERDICT = {
  likely: { label: 'Likely to miss', tone: 'leak' },
  maybe: { label: 'Maybe', tone: 'warn' },
  fine: { label: 'Looks fine', tone: 'saved' },
  'not-enough-data': { label: 'Not enough days', tone: 'idle' },
} as const;

export function Forecast() {
  const snap = useSnap();
  const m = useMoney();
  const ds = snap.world.dataset;
  const name = (id: string) => ds.adSets.find((s) => s.id === id)?.name ?? id;
  const rows = snap.forecast;
  const counts = { likely: rows.filter((r) => r.verdict === 'likely').length, maybe: rows.filter((r) => r.verdict === 'maybe').length };

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">Tomorrow</span>
        <h1 className="h-lg">Which ad sets will miss {m(ds.account.targetCost)} a sale tomorrow?</h1>
        <p className="lede">
          {counts.likely} likely, {counts.maybe} maybe. Worked out from each ad set’s last 14 days. We only forecast with at least {MIN_FORECAST_ROWS} days of data.
        </p>
      </header>
      <div className="fc-list">
        {rows.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <div key={r.adSetId} className="card fc-row">
              <div className="fc-head">
                <b>{name(r.adSetId)}</b>
                <span className={`chip ${v.tone}`}>{v.label}</span>
              </div>
              {r.probability !== null ? (
                <div className="fc-bar-row">
                  <div className={`fbar big v-${r.verdict}`}><i style={{ width: `${r.probability * 100}%` }} /></div>
                  <span className="num fc-pct">{Math.round(r.probability * 100)}%</span>
                </div>
              ) : (
                <div className="fc-bar-row">
                  <div className="fbar big v-not-enough-data"><i style={{ width: `${(r.rows / MIN_FORECAST_ROWS) * 100}%` }} /></div>
                  <span className="num fc-pct mist">{r.rows}/{MIN_FORECAST_ROWS}</span>
                </div>
              )}
              <ul className="fc-reasons">
                {r.reasons.map((x) => <li key={x} className="small muted">{x}</li>)}
                <li className="tiny mist">Based on {r.rows} days</li>
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mist tiny" style={{ marginTop: 24 }}>
        How it works: each day counts as a miss when its 3-day cost per sale is over your target. Recent days weigh more. Pro accounts add a forecasting service trained for small tables; we publish its backtest hit rate when it is measured.
      </p>
    </div>
  );
}
