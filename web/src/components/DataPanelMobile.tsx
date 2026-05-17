import { AnimatePresence, motion } from 'framer-motion';
import {
  formatAge,
  formatClock,
  formatCountdown,
  formatTokens,
  intensityPct,
  sessionProgressPct,
  shortModel,
} from '../lib/format';
import type { Currency } from '../lib/layout';
import type { SignalSnapshot } from '../lib/types';
import { LiveSessions } from './LiveSessions';

// Phone-friendly widget grid. Two-column glass chips, some spanning both
// columns for headlines. Tap-friendly, scrollable, no drag chaos.

interface Props {
  snapshot: SignalSnapshot | null;
  connected: boolean;
  staleMs: number;
  currency: Currency;
  onToggleCurrency: () => void;
  onMoodHack?: () => void;
  formatMoney: (rupees: number) => string;
}

interface ChipProps {
  span?: 1 | 2;
  accent?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

function Chip({ span = 1, accent = 'rgba(90,240,255,0.18)', onClick, children }: ChipProps): JSX.Element {
  const Wrapper = onClick ? motion.button : motion.div;
  return (
    <Wrapper
      // biome-ignore lint/suspicious/noExplicitAny: motion union type
      {...({
        type: onClick ? 'button' : undefined,
        onClick,
        whileTap: onClick ? { scale: 0.97 } : undefined,
        whileHover: onClick ? { y: -2 } : undefined,
      } as any)}
      style={{
        gridColumn: span === 2 ? 'span 2' : undefined,
        background: 'rgba(10, 13, 24, 0.86)',
        border: `1px solid ${accent}`,
        borderRadius: 12,
        padding: '12px 14px',
        boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
        minHeight: 84,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        color: 'var(--text)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </Wrapper>
  );
}

function ChipLabel({ children, color = 'var(--dim)' }: { children: React.ReactNode; color?: string }): JSX.Element {
  return (
    <div style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1.2 }}>
      {children}
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }): JSX.Element {
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      <motion.div
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: 0.5 }}
        style={{ height: '100%', background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}

function severity(pct: number): string {
  if (pct > 90) return 'var(--crit)';
  if (pct > 70) return 'var(--warn)';
  return 'var(--ok)';
}

export function DataPanelMobile({
  snapshot,
  connected,
  staleMs,
  currency: _currency,
  onToggleCurrency,
  onMoodHack,
  formatMoney,
}: Props): JSX.Element {
  if (!snapshot?.claude) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--dim)', padding: 24 }}>
        {connected ? 'waiting for first poll…' : 'connecting…'}
      </div>
    );
  }

  const fresh = connected && staleMs < 3000;
  const indicator = !connected
    ? { color: 'var(--crit)', label: 'offline' }
    : !fresh
      ? { color: 'var(--warn)', label: `stale ${Math.round(staleMs / 1000)}s` }
      : { color: 'var(--ok)', label: 'live' };
  const c = snapshot.claude;
  const hw = snapshot.hardware;
  const intensity = intensityPct(c.tokensWindow);
  const memPct = hw.memTotalBytes > 0 ? (hw.memUsedBytes / hw.memTotalBytes) * 100 : 0;
  const sessionPct = sessionProgressPct(c.windowStartMs);
  const topModel = c.byModel[0];
  const topProject = c.byProject[0];

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        // Leave the tank visible at the bottom of the viewport.
        bottom: 200,
        overflow: 'auto',
        padding: '52px 12px 12px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
        }}
      >
        {/* Headline cost — 2-wide hero chip. Tap to toggle currency. */}
        <Chip span={2} accent="rgba(90,240,255,0.35)" onClick={onToggleCurrency}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChipLabel>5h spend</ChipLabel>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: indicator.color }}>
              ● {indicator.label}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: 'var(--neon-cyan)',
                textShadow: '0 0 14px rgba(90,240,255,0.45)',
                letterSpacing: -0.5,
              }}
            >
              {formatMoney(c.costInr)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>{formatTokens(c.tokensWindow)} tok</div>
          </div>
          <MiniBar pct={intensity} color="var(--neon-cyan)" />
        </Chip>

        {/* Live sessions — wide chip immediately under the hero */}
        <Chip span={2} accent="rgba(111,255,138,0.3)">
          <LiveSessions projects={c.byProject} formatMoney={formatMoney} />
        </Chip>

        {/* Reset countdown */}
        <Chip accent="rgba(255,90,240,0.3)">
          <ChipLabel color="rgba(255,90,240,0.9)">resets in</ChipLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--neon-pink)' }}>
            {formatCountdown(c.resetsAtMs)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dim)' }}>{formatClock(c.resetsAtMs)}</div>
        </Chip>

        {/* Session progress */}
        <Chip accent="rgba(192,255,0,0.3)">
          <ChipLabel color="rgba(192,255,0,0.85)">session</ChipLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--neon-lime)' }}>
            {sessionPct.toFixed(0)}%
          </div>
          <MiniBar pct={sessionPct} color="var(--neon-lime)" />
        </Chip>

        {/* CPU */}
        <Chip>
          <ChipLabel>cpu</ChipLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: severity(hw.cpuPct) }}>
            {hw.cpuPct.toFixed(0)}%
          </div>
          <MiniBar pct={hw.cpuPct} color={severity(hw.cpuPct)} />
        </Chip>

        {/* RAM */}
        <Chip>
          <ChipLabel>ram</ChipLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: severity(memPct) }}>
            {memPct.toFixed(0)}%
          </div>
          <MiniBar pct={memPct} color={severity(memPct)} />
        </Chip>

        {/* Input tokens */}
        <Chip>
          <ChipLabel>input</ChipLabel>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{formatTokens(c.buckets.input)}</div>
          <div style={{ fontSize: 10, color: 'var(--dim)' }}>tokens sent</div>
        </Chip>

        {/* Output tokens */}
        <Chip accent="rgba(90,240,255,0.3)">
          <ChipLabel color="rgba(90,240,255,0.85)">output</ChipLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--neon-cyan)' }}>
            {formatTokens(c.buckets.output)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dim)' }}>tokens received</div>
        </Chip>

        {/* Cache write */}
        <Chip>
          <ChipLabel>cache write</ChipLabel>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{formatTokens(c.buckets.cacheCreation)}</div>
          <div style={{ fontSize: 10, color: 'var(--dim)' }}>first-pass</div>
        </Chip>

        {/* Cache read */}
        <Chip accent="rgba(255,215,0,0.3)">
          <ChipLabel color="rgba(255,215,0,0.85)">cache read</ChipLabel>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neon-yellow)' }}>
            {formatTokens(c.buckets.cacheRead)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dim)' }}>cheap reuse</div>
        </Chip>

        {/* Top model */}
        {topModel ? (
          <Chip accent="rgba(255,90,240,0.2)">
            <ChipLabel color="rgba(255,90,240,0.85)">top model</ChipLabel>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neon-pink)' }}>
              {shortModel(topModel.model)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--neon-lime)' }}>
              {formatMoney(topModel.costInr)}
            </div>
          </Chip>
        ) : null}

        {/* Top project */}
        {topProject ? (
          <Chip accent="rgba(90,240,255,0.2)">
            <ChipLabel color="rgba(90,240,255,0.85)">top project</ChipLabel>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--neon-cyan)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {topProject.project}
            </div>
            <div style={{ fontSize: 11, color: 'var(--neon-lime)' }}>
              {formatMoney(topProject.costInr)}
            </div>
          </Chip>
        ) : null}

        {/* Last turn — wide chip with mood */}
        <Chip span={2} accent="rgba(192,255,0,0.25)" onClick={onMoodHack}>
          <ChipLabel color="rgba(192,255,0,0.85)">last activity</ChipLabel>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {c.currentProject ?? 'idle'}
            {c.currentModel ? <span style={{ color: 'var(--dim)' }}> · {shortModel(c.currentModel)}</span> : null}
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
            {formatAge(c.latestAgeMs)} · tap to cycle mood
          </div>
        </Chip>

        {/* Recent feed — wide chip with mini-list */}
        {c.recent.length > 0 ? (
          <Chip span={2}>
            <ChipLabel>recent turns</ChipLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              <AnimatePresence initial={false}>
                {c.recent.slice(0, 4).map((r) => (
                  <motion.div
                    key={`${r.ts}-${r.inputTokens}`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '54px 52px 1fr auto',
                      gap: 6,
                      fontSize: 11,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'var(--dim)' }}>{formatAge(Date.now() - r.ts)}</span>
                    <span>{shortModel(r.model)}</span>
                    <span>
                      <span style={{ color: 'var(--dim)' }}>{formatTokens(r.inputTokens)}</span>{' '}
                      <span style={{ color: 'var(--neon-cyan)' }}>→</span>{' '}
                      <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>
                        {formatTokens(r.outputTokens)}
                      </span>
                    </span>
                    <span
                      style={{
                        color: 'var(--neon-pink)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 90,
                      }}
                    >
                      {r.project || '—'}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

// Reserved for future per-chip currency overrides.
export const _unused_: undefined = undefined;
