import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import {
  formatAge,
  formatClock,
  formatCountdown,
  formatInr,
  formatTokens,
  intensityPct,
  moodFromTokens,
  sessionProgressPct,
  shortModel,
} from '../lib/format';
import { type Currency, loadCurrency, resetLayout, saveCurrency } from '../lib/layout';
import type { SignalSnapshot } from '../lib/types';
import { DraggableCard } from './DraggableCard';

interface Props {
  snapshot: SignalSnapshot | null;
  connected: boolean;
  staleMs?: number;
  onMoodHack?: () => void;
}

const USD_PER_INR = 1 / 84;
function formatMoney(rupees: number, currency: Currency): string {
  if (currency === 'usd') {
    const usd = rupees * USD_PER_INR;
    if (usd < 1) return `$${usd.toFixed(2)}`;
    if (usd < 1000) return `$${usd.toFixed(2)}`;
    return `$${usd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
  return formatInr(rupees);
}

function Bar({ pct, color }: { pct: number; color: string }): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        height: 8,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <motion.div
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          background: color,
          boxShadow: `0 0 12px ${color}`,
        }}
      />
    </div>
  );
}

function severityColor(pct: number | null): string {
  if (pct === null) return 'var(--dim)';
  if (pct > 90) return 'var(--crit)';
  if (pct > 70) return 'var(--warn)';
  return 'var(--ok)';
}

function CardTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--dim)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function DataPanel({ snapshot, connected, staleMs = 0, onMoodHack }: Props): JSX.Element {
  const [currency, setCurrencyState] = useState<Currency>(loadCurrency());
  const toggleCurrency = (): void => {
    const next: Currency = currency === 'inr' ? 'usd' : 'inr';
    setCurrencyState(next);
    saveCurrency(next);
  };

  const fresh = connected && staleMs < 3000;
  const indicator = !connected
    ? { color: 'var(--crit)', label: 'offline' }
    : !fresh
      ? { color: 'var(--warn)', label: `stale ${Math.round(staleMs / 1000)}s` }
      : { color: 'var(--ok)', label: 'live' };

  if (!snapshot) {
    return (
      <div
        style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 5 }}
      >
        <div
          style={{
            background: 'rgba(10,13,24,0.8)',
            border: '1px solid rgba(90,240,255,0.2)',
            padding: '12px 18px',
            borderRadius: 6,
            color: 'var(--dim)',
          }}
        >
          {connected ? 'waiting for first poll…' : 'connecting to daemon…'}
        </div>
      </div>
    );
  }

  const claude = snapshot.claude;
  const hw = snapshot.hardware;
  const intensity = intensityPct(claude.tokensWindow);
  const cpuColor = severityColor(hw.cpuPct);
  const memPct = hw.memTotalBytes > 0 ? (hw.memUsedBytes / hw.memTotalBytes) * 100 : 0;
  const memColor = severityColor(memPct);
  const sessionPct = sessionProgressPct(claude.windowStartMs);
  const mood = moodFromTokens(claude.tokensWindow);

  return (
    <>
      {/* TOP LEFT — headline cost + session */}
      <DraggableCard id="summary" anchor={{ top: 16, left: 16, width: 320 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <CardTitle>5h window</CardTitle>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: indicator.color }}>
            ● {indicator.label}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <motion.button
            type="button"
            onClick={toggleCurrency}
            whileTap={{ scale: 0.92 }}
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--neon-cyan)',
              textShadow: '0 0 12px rgba(90,240,255,0.4)',
              background: 'transparent',
              border: 0,
              padding: 0,
              cursor: 'pointer',
            }}
            title="tap to toggle currency"
          >
            {formatMoney(claude.costInr, currency)}
          </motion.button>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            {formatTokens(claude.tokensWindow)} tok
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <Bar pct={intensity} color="var(--neon-cyan)" />
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--dim)',
          }}
        >
          <div>
            session <span style={{ color: 'var(--neon-lime)' }}>{sessionPct.toFixed(0)}%</span>
          </div>
          <div>
            resets in{' '}
            <span style={{ color: 'var(--neon-pink)' }}>
              {formatCountdown(claude.resetsAtMs)}
            </span>{' '}
            <span>({formatClock(claude.resetsAtMs)})</span>
          </div>
        </div>
      </DraggableCard>

      {/* TOP RIGHT — hardware */}
      <DraggableCard id="host" anchor={{ top: 16, right: 16, width: 240 }}>
        <CardTitle>host</CardTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 36px',
            alignItems: 'center',
            columnGap: 8,
            rowGap: 6,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>cpu</div>
          <Bar pct={hw.cpuPct} color={cpuColor} />
          <div style={{ fontSize: 11, textAlign: 'right' }}>{hw.cpuPct.toFixed(0)}%</div>

          <div style={{ fontSize: 11, color: 'var(--dim)' }}>ram</div>
          <Bar pct={memPct} color={memColor} />
          <div style={{ fontSize: 11, textAlign: 'right' }}>{memPct.toFixed(0)}%</div>

          <div style={{ fontSize: 11, color: 'var(--dim)' }}>load</div>
          <div style={{ gridColumn: '2 / span 2', fontSize: 11 }}>
            {hw.load1m.toFixed(2)} · {hw.load5m.toFixed(2)} · {hw.load15m.toFixed(2)}
            {hw.gpuPct !== null ? (
              <span style={{ color: 'var(--dim)' }}> · gpu {hw.gpuPct.toFixed(0)}%</span>
            ) : null}
          </div>
        </div>
      </DraggableCard>

      {/* TOKEN FLOW */}
      <DraggableCard id="tokenflow" anchor={{ top: 200, left: 16, width: 320 }}>
        <CardTitle>token flow</CardTitle>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {formatTokens(claude.buckets.input)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>input</div>
          </div>
          <motion.div
            animate={{ x: [0, 6, 0] }}
            transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            style={{ fontSize: 18, color: 'var(--neon-cyan)' }}
          >
            →
          </motion.div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neon-cyan)' }}>
              {formatTokens(claude.buckets.output)}
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
            <span style={{ color: 'var(--text)' }}>
              {formatTokens(claude.buckets.cacheCreation)}
            </span>
          </div>
          <div>
            cache read{' '}
            <span style={{ color: 'var(--text)' }}>{formatTokens(claude.buckets.cacheRead)}</span>
          </div>
        </div>
      </DraggableCard>

      {/* MODELS */}
      {claude.byModel.length > 0 ? (
        <DraggableCard id="models" anchor={{ top: 160, right: 16, width: 240 }}>
          <CardTitle>models</CardTitle>
          {claude.byModel.slice(0, 4).map((m) => {
            const topT = claude.byModel[0]?.tokens ?? 1;
            const pct = (m.tokens / topT) * 100;
            return (
              <div key={m.model} style={{ marginBottom: 6 }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}
                >
                  <span>{shortModel(m.model)}</span>
                  <span style={{ color: 'var(--neon-lime)' }}>
                    {formatMoney(m.costInr, currency)}
                  </span>
                </div>
                <Bar pct={pct} color="var(--neon-pink)" />
                <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
                  {formatTokens(m.tokens)} tok
                </div>
              </div>
            );
          })}
        </DraggableCard>
      ) : null}

      {/* PROJECTS */}
      {claude.byProject.length > 0 ? (
        <DraggableCard id="projects" anchor={{ bottom: 80, left: 16, width: 320 }}>
          <CardTitle>projects</CardTitle>
          {claude.byProject.slice(0, 4).map((p) => {
            const topT = claude.byProject[0]?.tokens ?? 1;
            const pct = (p.tokens / topT) * 100;
            return (
              <div key={p.project} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--neon-cyan)' }}>{p.project}</span>
                  <span style={{ color: 'var(--neon-lime)' }}>
                    {formatMoney(p.costInr, currency)}
                  </span>
                </div>
                <Bar pct={pct} color="var(--neon-cyan)" />
                <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>
                  {formatTokens(p.tokens)} tok · {p.models.map(shortModel).join(' ')}
                </div>
              </div>
            );
          })}
        </DraggableCard>
      ) : null}

      {/* RECENT */}
      {claude.recent.length > 0 ? (
        <DraggableCard id="recent" anchor={{ bottom: 80, right: 16, width: 300 }}>
          <CardTitle>recent turns</CardTitle>
          <AnimatePresence initial={false}>
            {claude.recent.slice(0, 6).map((r) => (
              <motion.div
                key={`${r.ts}-${r.inputTokens}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 56px 1fr auto',
                  gap: 8,
                  fontSize: 11,
                  padding: '3px 0',
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
                <span style={{ color: 'var(--neon-pink)' }}>{r.project || '—'}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </DraggableCard>
      ) : null}

      {/* BOTTOM CENTER — mood chip (tap = Easter egg) */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0,
          display: 'grid',
          placeItems: 'center',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <motion.button
          type="button"
          onClick={onMoodHack}
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.03 }}
          style={{
            padding: '6px 14px',
            background: 'rgba(10, 13, 24, 0.85)',
            border: '1px solid rgba(192, 255, 0, 0.25)',
            borderRadius: 999,
            fontSize: 12,
            color: 'var(--neon-lime)',
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          title="tap to cycle moods"
        >
          *{' '}
          {claude.currentProject
            ? `${moodLabel(mood)} in ${claude.currentProject} · ${shortModel(claude.currentModel ?? '')} · last turn ${formatAge(claude.latestAgeMs)}`
            : 'idle'}
        </motion.button>
      </div>

      {/* RESET LAYOUT — tiny button bottom-right corner */}
      <button
        type="button"
        onClick={() => {
          resetLayout();
          window.location.reload();
        }}
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 6,
          padding: '4px 10px',
          fontSize: 10,
          color: 'var(--dim)',
          background: 'rgba(10,13,24,0.6)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 999,
          cursor: 'pointer',
        }}
        title="reset layout — put cards back where they started"
      >
        ⟲ layout
      </button>
    </>
  );
}

function moodLabel(m: ReturnType<typeof moodFromTokens>): string {
  switch (m) {
    case 'chill':
      return 'taking it easy';
    case 'focused':
      return 'in the zone';
    case 'cooking':
      return 'cooking';
    case 'burning':
      return 'on fire';
  }
}
