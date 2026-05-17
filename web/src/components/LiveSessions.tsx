import { motion } from 'framer-motion';
import { formatAge, formatTokens, shortModel } from '../lib/format';
import { type ProjectTotal, type ProjectStatus, projectStatus } from '../lib/types';

interface Props {
  projects: ProjectTotal[];
  formatMoney: (rupees: number) => string;
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  live: 'var(--ok)',
  recent: 'var(--warn)',
  idle: 'var(--dim)',
};

function StatusDot({ status }: { status: ProjectStatus }): JSX.Element {
  const color = STATUS_COLOR[status];
  if (status === 'live') {
    return (
      <motion.div
        animate={{ scale: [1, 1.25, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 10px ${color}`,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        opacity: status === 'recent' ? 0.85 : 0.5,
      }}
    />
  );
}

// Header counter: how many live sessions are there right now? Useful as a
// glanceable "are you actually working in N places at once" indicator.
export function LiveSessions({ projects, formatMoney }: Props): JSX.Element {
  const now = Date.now();
  const decorated = projects
    .map((p) => ({ ...p, status: projectStatus(p.lastTurnMs, now) }))
    .sort((a, b) => b.lastTurnMs - a.lastTurnMs);
  const liveCount = decorated.filter((p) => p.status === 'live').length;
  const recentCount = decorated.filter((p) => p.status === 'recent').length;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: 'var(--dim)',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
          }}
        >
          live sessions
        </div>
        <div style={{ fontSize: 10, color: 'var(--dim)' }}>
          <span style={{ color: 'var(--ok)' }}>● {liveCount} live</span>
          {recentCount > 0 ? (
            <>
              <span> · </span>
              <span style={{ color: 'var(--warn)' }}>● {recentCount} recent</span>
            </>
          ) : null}
        </div>
      </div>
      {decorated.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--dim)' }}>no sessions in the 5h window</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {decorated.slice(0, 6).map((p) => (
            <div
              key={p.project}
              style={{
                display: 'grid',
                gridTemplateColumns: '12px 1fr auto auto',
                gap: 8,
                alignItems: 'center',
                padding: '4px 0',
              }}
            >
              <StatusDot status={p.status} />
              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: 12,
                    color: p.status === 'live' ? 'var(--neon-cyan)' : 'var(--text)',
                    fontWeight: p.status === 'live' ? 700 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.project}
                </div>
                <div style={{ fontSize: 10, color: 'var(--dim)' }}>
                  {p.models.map(shortModel).join(' ')} · {formatTokens(p.tokens)} tok ·{' '}
                  {formatAge(now - p.lastTurnMs)}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--neon-lime)', textAlign: 'right' }}>
                {formatMoney(p.costInr)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
