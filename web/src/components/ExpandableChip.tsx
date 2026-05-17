import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

interface Props {
  span?: 1 | 2;
  accent?: string;
  title: string;
  /** Right-side summary text shown next to the title in the chip header. */
  summary?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function ExpandableChip({
  span = 2,
  accent = 'rgba(90,240,255,0.18)',
  title,
  summary,
  defaultExpanded = true,
  children,
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <motion.div
      style={{
        gridColumn: span === 2 ? 'span 2' : undefined,
        background: 'rgba(10, 13, 24, 0.86)',
        border: `1px solid ${accent}`,
        borderRadius: 12,
        boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'transparent',
          border: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          color: 'var(--text)',
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: 'var(--dim)',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', minWidth: 0, textAlign: 'right' }}>
            {summary}
          </div>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: 11, color: 'var(--dim)', display: 'inline-block' }}
          >
            ▾
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px' }}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
