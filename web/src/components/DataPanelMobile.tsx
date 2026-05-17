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
import { ExpandableChip } from './ExpandableChip';
import { RunningSessions } from './RunningSessions';

// Phone widget grid. Consolidated from 14 chips down to 7 — related data
// stays together, and detail-heavy sections are collapsible.

interface Props {
  snapshot: SignalSnapshot | null;
  connected: boolean;
  staleMs: number;
  currency: Currency;
  onToggleCurrency: () => void;
  onMoodHack?: () => void;
  formatMoney: (rupees: number) => string;
}

function Chip({
  span = 1,
  accent = 'rgba(90,240,255,0.18)',
  onClick,
  children,
}: {
  span?: 1 | 2;
  accent?: string;
  onClick?: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const Wrapper = onClick ? motion.button : motion.div;
  return (
    <Wrapper
      // biome-ignore lint/suspicious/noExplicitAny: framer-motion union types
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
        minHeight: 80,
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

function ChipLabel({
  children,
  color = 'var(--dim)',
}: { children: React.ReactNode; color?: string }): JSX.Element {
  return (
    <div style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1.2 }}>
      {children}
    </div>
  );
}

function Bar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }): JSX.Element {
  return (
    <div
      style={{
        height,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 4,
      }}
    >
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
      <div
        style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--dim)', padding: 24 }}
      >
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
  // Rough "cache savings" — input-equivalent tokens we'd have paid for if
  // there were no prompt-caching. cache reads are ~10× cheaper than input.
  const cacheSavedEquivalent = c.buckets.cacheRead * 0.9;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 200,
        overflow: 'auto',
        padding: '52px 12px 12px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {/* HERO — spend + tokens + session + reset, all the "where am I in the 5h budget" data */}
        <Chip span={2} accent="rgba(90,240,255,0.35)" onClick={onToggleCurrency}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChipLabel>5h window</ChipLabel>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: indicator.color }}>
              ● {indicator.label}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--neon-cyan)',
                textShadow: '0 0 14px rgba(90,240,255,0.45)',
                letterSpacing: -0.5,
                lineHeight: 1,
              }}
            >
              {formatMoney(c.costInr)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--dim)' }}>{formatTokens(c.tokensWindow)} tok</div>
          </div>
          <Bar pct={intensity} color="var(--neon-cyan)" height={8} />
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--dim)',
            }}
          >
            <div>
              session{' '}
              <span style={{ color: 'var(--neon-lime)', fontWeight: 600 }}>
                {sessionPct.toFixed(0)}%
              </span>
            </div>
            <div>
              resets in{' '}
              <span style={{ color: 'var(--neon-pink)', fontWeight: 600 }}>
                {formatCountdown(c.resetsAtMs)}
              </span>{' '}
              <span>({formatClock(c.resetsAtMs)})</span>
            </div>
          </div>
        </Chip>

        {/* RUNNING TERMINALS — the killer feature, always expanded */}
        <Chip span={2} accent="rgba(90,240,255,0.35)">
          <RunningSessions
            processes={snapshot.processes ?? []}
            projects={c.byProject}
            formatMoney={formatMoney}
          />
        </Chip>

        {/* TOKEN FLOW + CACHE SAVINGS — collapsible */}
        <ExpandableChip
          accent="rgba(90,240,255,0.25)"
          title="token flow"
          summary={
            <>
              <span style={{ color: 'var(--text)' }}>{formatTokens(c.buckets.input)}</span>{' '}
              <span style={{ color: 'var(--neon-cyan)' }}>→</span>{' '}
              <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>
                {formatTokens(c.buckets.output)}
              </span>
            </>
          }
          defaultExpanded={true}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatTokens(c.buckets.input)}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>input</div>
            </div>
            <motion.div
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
              style={{ fontSize: 22, color: 'var(--neon-cyan)' }}
            >
              →
            </motion.div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--neon-cyan)' }}>
                {formatTokens(c.buckets.output)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>output</div>
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--dim)',
            }}
          >
            <div>
              cache write{' '}
              <span style={{ color: 'var(--text)' }}>{formatTokens(c.buckets.cacheCreation)}</span>
            </div>
            <div>
              cache read{' '}
              <span style={{ color: 'var(--neon-yellow)' }}>{formatTokens(c.buckets.cacheRead)}</span>
            </div>
          </div>
          {c.buckets.cacheRead > 0 ? (
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                background: 'rgba(192,255,0,0.05)',
                border: '1px solid rgba(192,255,0,0.2)',
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              <span style={{ color: 'var(--neon-lime)' }}>cache savings:</span>{' '}
              reusing prompts saved roughly{' '}
              <span style={{ color: 'var(--neon-yellow)', fontWeight: 700 }}>
                {formatTokens(Math.round(cacheSavedEquivalent))}
              </span>{' '}
              tokens of full input charges
            </div>
          ) : null}
        </ExpandableChip>

        {/* MODELS — collapsible list with per-model bars and cost */}
        {c.byModel.length > 0 ? (
          <ExpandableChip
            accent="rgba(255,90,240,0.25)"
            title="models"
            summary={
              <span>
                {c.byModel
                  .slice(0, 3)
                  .map((m) => shortModel(m.model))
                  .join(' · ')}
              </span>
            }
            defaultExpanded={false}
          >
            {c.byModel.map((m) => {
              const top = c.byModel[0]?.tokens ?? 1;
              const pct = (m.tokens / top) * 100;
              return (
                <div key={m.model} style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{shortModel(m.model)}</span>
                    <span style={{ color: 'var(--neon-lime)' }}>{formatMoney(m.costInr)}</span>
                  </div>
                  <Bar pct={pct} color="var(--neon-pink)" />
                  <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
                    {formatTokens(m.tokens)} tok
                  </div>
                </div>
              );
            })}
          </ExpandableChip>
        ) : null}

        {/* HOST — single compact chip for all hardware metrics */}
        <Chip span={2}>
          <ChipLabel>host</ChipLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 48px',
              alignItems: 'center',
              gap: 8,
              rowGap: 6,
              marginTop: 4,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>cpu</div>
            <Bar pct={hw.cpuPct} color={severity(hw.cpuPct)} height={6} />
            <div style={{ fontSize: 11, textAlign: 'right' }}>{hw.cpuPct.toFixed(0)}%</div>

            <div style={{ fontSize: 11, color: 'var(--dim)' }}>ram</div>
            <Bar pct={memPct} color={severity(memPct)} height={6} />
            <div style={{ fontSize: 11, textAlign: 'right' }}>{memPct.toFixed(0)}%</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--dim)' }}>
            load {hw.load1m.toFixed(2)} · {hw.load5m.toFixed(2)} · {hw.load15m.toFixed(2)}
            {hw.gpuPct !== null ? ` · gpu ${hw.gpuPct.toFixed(0)}%` : ''}
          </div>
        </Chip>

        {/* LAST ACTIVITY / MOOD — keep as it doubles as the Easter egg */}
        <Chip span={2} accent="rgba(192,255,0,0.25)" onClick={onMoodHack}>
          <ChipLabel color="rgba(192,255,0,0.85)">last activity</ChipLabel>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {c.currentProject ?? 'idle'}
            {c.currentModel ? (
              <span style={{ color: 'var(--dim)' }}> · {shortModel(c.currentModel)}</span>
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
            {formatAge(c.latestAgeMs)} · tap to cycle mood
          </div>
        </Chip>

        {/* RECENT TURNS — collapsible, default closed */}
        {c.recent.length > 0 ? (
          <ExpandableChip
            title="recent turns"
            summary={<span>{c.recent.length} in window</span>}
            defaultExpanded={false}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              <AnimatePresence initial={false}>
                {c.recent.slice(0, 6).map((r) => (
                  <motion.div
                    key={`${r.ts}-${r.inputTokens}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '54px 50px 1fr auto',
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
          </ExpandableChip>
        ) : null}
      </div>
    </div>
  );
}
