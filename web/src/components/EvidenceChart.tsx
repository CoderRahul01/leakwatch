import { useMemo, useState } from 'react';
import { money, shortDate, type Currency, type Series } from '@shared';

function fmt(v: number, unit: Series['unit'], cur: Currency) {
  if (unit === 'money') return money(v, cur);
  if (unit === 'ratio') return v < 1 ? `${(v * 100).toFixed(2)}%` : v.toFixed(1);
  return String(Math.round(v));
}

/** Bars for the first series, a line for the second, the change point marked. */
/** `partialLast`: the last day is still running, so it is drawn faded and labelled "so far". */
export function EvidenceChart({ series, changeIndex, currency, partialLast = false }: { series: Series[]; changeIndex?: number; currency: Currency; partialLast?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 8, r: 8, t: 18, b: 26 };
  const bars = series[0];
  const line = series[1];
  const n = bars.values.length;
  const bw = (W - pad.l - pad.r) / n;
  const maxB = Math.max(1, ...bars.values);
  const maxL = line ? Math.max(1e-9, ...line.values) : 1;
  const y = (v: number, max: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const path = useMemo(() => {
    if (!line) return '';
    return line.values.map((v, i) => `${i ? 'L' : 'M'}${pad.l + bw * i + bw / 2},${y(v, maxL)}`).join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, bw, maxL]);

  const h = hover ?? (changeIndex !== undefined ? changeIndex : n - 1);

  return (
    <figure className="evchart">
      <div className="evchart-legend">
        <span><i className="sw bar" /> {bars.label}</span>
        {line && <span><i className="sw line" /> {line.label}</span>}
        <span className="evchart-read num">
          {shortDate(bars.dates[h])}{partialLast && h === n - 1 ? ' so far' : ''}: {fmt(bars.values[h], bars.unit, currency)}
          {line ? ` · ${fmt(line.values[h], line.unit, currency)}` : ''}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${bars.label} by day`} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="evbar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--signal-hi)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--signal)" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="evbar-after" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--leak)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--leak)" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * k} y2={pad.t + (H - pad.t - pad.b) * k} className="evgrid" />
        ))}
        {bars.values.map((v, i) => {
          const after = changeIndex !== undefined && i >= changeIndex;
          const top = y(v, maxB);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + bw * i} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <rect
                className={`evbar${partialLast && i === n - 1 ? ' partial' : ''}`}
                style={{ animationDelay: `${i * 14}ms` }}
                x={pad.l + bw * i + bw * 0.18}
                y={top}
                width={bw * 0.64}
                height={Math.max(v > 0 ? 2 : 0, H - pad.b - top)}
                rx={Math.min(3, bw * 0.2)}
                fill={after ? 'url(#evbar-after)' : 'url(#evbar)'}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
              {v === 0 && after && <rect x={pad.l + bw * i + bw * 0.18} y={H - pad.b - 2} width={bw * 0.64} height={2} fill="var(--leak)" />}
            </g>
          );
        })}
        {line && <path d={path} className="evline" fill="none" />}
        {changeIndex !== undefined && (
          <g className="evchange">
            <line x1={pad.l + bw * changeIndex} x2={pad.l + bw * changeIndex} y1={4} y2={H - pad.b} />
            <text x={pad.l + bw * changeIndex + 6} y={13}>
              {shortDate(bars.dates[changeIndex])}
            </text>
          </g>
        )}
        <text x={pad.l} y={H - 6} className="evaxis">{shortDate(bars.dates[0])}</text>
        <text x={W - pad.r} y={H - 6} className="evaxis" textAnchor="end">{partialLast ? 'Today so far' : shortDate(bars.dates[n - 1])}</text>
      </svg>
    </figure>
  );
}
