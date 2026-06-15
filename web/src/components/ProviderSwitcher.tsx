import { motion } from 'framer-motion';
import type { ProviderSummary } from '../lib/types';
import { providerColor, providerLabel } from '../lib/providers';
import { formatTokens } from '../lib/format';

interface Props {
  providers: ProviderSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  formatMoney: (rupees: number) => string;
}

/**
 * Floating provider pills, top-left. Shown only when 2+ providers have data.
 * Tap to switch which provider's data the dashboard renders.
 */
export function ProviderSwitcher({
  providers,
  selectedId,
  onSelect,
  formatMoney,
}: Props): JSX.Element | null {
  if (providers.length < 2) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        display: 'flex',
        gap: 6,
        zIndex: 9500,
        pointerEvents: 'auto',
      }}
    >
      {providers.map((p) => {
        const active = p.provider === selectedId;
        const color = providerColor(p.provider);
        return (
          <motion.button
            key={p.provider}
            type="button"
            onClick={() => onSelect(p.provider)}
            whileTap={{ scale: 0.94 }}
            whileHover={{ y: -1 }}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
              background: active ? `${color}22` : 'rgba(10,13,24,0.85)',
              color: active ? color : 'var(--dim)',
              fontFamily: 'inherit',
              fontSize: 11,
              cursor: 'pointer',
              boxShadow: active ? `0 0 12px ${color}44` : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: color,
                boxShadow: active ? `0 0 6px ${color}` : undefined,
              }}
            />
            <span style={{ fontWeight: active ? 700 : 500 }}>{providerLabel(p.provider)}</span>
            <span style={{ color: 'var(--dim)' }}>·</span>
            <span style={{ color: active ? 'var(--text)' : 'var(--dim)' }}>
              {formatMoney(p.costInr)}
            </span>
            <span style={{ color: 'var(--dim)' }}>·</span>
            <span style={{ color: 'var(--dim)' }}>{formatTokens(p.tokensWindow)} tok</span>
          </motion.button>
        );
      })}
    </div>
  );
}
