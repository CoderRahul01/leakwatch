import type { Step } from '@shared';
import { STEP_ICON } from './Icons';

export const STEP_LABEL: Record<Step, string> = {
  spend: 'Spend',
  click: 'Click',
  page: 'Page',
  tracking: 'Tracking',
  sale: 'Sale',
};

export type NodeHealth = 'ok' | 'leak' | 'warn' | 'idle' | 'checking' | 'gain';

export interface ChainNode {
  step: Step;
  health: NodeHealth;
  /** Short caption under the node: an amount or a state. */
  caption?: string;
}

/**
 * The signature element: Spend → Click → Page → Tracking → Sale.
 * Money flows along the line; where it escapes, a drop falls.
 */
export function Chain({
  nodes,
  focus,
  size = 'md',
  onPick,
  flowing = true,
}: {
  nodes: ChainNode[];
  focus?: Step | null;
  size?: 'sm' | 'md' | 'lg';
  onPick?: (s: Step) => void;
  flowing?: boolean;
}) {
  return (
    <ol className={`chain chain-${size}${flowing ? ' flowing' : ''}`} aria-label="Ad to sale path">
      {nodes.map((n, i) => {
        const Icon = STEP_ICON[n.step];
        const broken = n.health === 'leak' || n.health === 'warn';
        const next = nodes[i + 1];
        const Tag = onPick ? 'button' : 'div';
        return (
          <li key={n.step} className={`chain-item h-${n.health}${focus === n.step ? ' focus' : ''}${focus && focus !== n.step ? ' dim' : ''}`}>
            <Tag className="chain-node" {...(onPick ? { onClick: () => onPick(n.step), type: 'button' } : {})} aria-label={`${STEP_LABEL[n.step]}: ${n.caption ?? n.health}`}>
              <span className="chain-ring">
                <Icon size={size === 'sm' ? 14 : 18} />
              </span>
              {broken && (
                <span className="drip" aria-hidden>
                  <svg viewBox="0 0 12 16" width="10" height="14">
                    <path d="M6 0c3.3 4.2 5 7.2 5 9.5a5 5 0 0 1-10 0C1 7.2 2.7 4.2 6 0z" fill="currentColor" />
                  </svg>
                </span>
              )}
              <span className="chain-text">
                <span className="chain-label">{STEP_LABEL[n.step]}</span>
                {n.caption && <span className="chain-cap num">{n.caption}</span>}
              </span>
            </Tag>
            {next && <span className={`chain-link${broken ? ' cut' : ''}`} aria-hidden><span className="chain-flow" /></span>}
          </li>
        );
      })}
    </ol>
  );
}
