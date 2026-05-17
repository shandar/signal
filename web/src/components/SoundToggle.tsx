import { motion } from 'framer-motion';
import { unlockAudio } from '../lib/sounds';

interface Props {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

// Floating pill button — sits in the bottom-left corner, mirror of the
// "reset layout" button on the right. Tapping it both toggles sound and
// unlocks the audio context on mobile.

export function SoundToggle({ enabled, onToggle }: Props): JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={() => {
        unlockAudio();
        onToggle(!enabled);
      }}
      whileTap={{ scale: 0.93 }}
      whileHover={{ scale: 1.05 }}
      aria-label={enabled ? 'mute sounds' : 'enable sounds'}
      title={enabled ? 'mute sounds' : 'enable sounds'}
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 6,
        width: 40,
        height: 32,
        padding: 0,
        display: 'grid',
        placeItems: 'center',
        fontSize: 14,
        color: enabled ? 'var(--neon-cyan)' : 'var(--dim)',
        background: 'rgba(10,13,24,0.85)',
        border: `1px solid ${enabled ? 'rgba(90,240,255,0.35)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 999,
        boxShadow: enabled ? '0 0 10px rgba(90,240,255,0.18)' : undefined,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {enabled ? (
        // Speaker on (three sound waves)
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 6h2.5L7 4v8L4.5 10H2V6z" fill="currentColor" />
          <path d="M9.5 5.5c.6.6 1 1.5 1 2.5s-.4 1.9-1 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M11.5 3.5c1.3 1.2 2 2.8 2 4.5s-.7 3.3-2 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      ) : (
        // Speaker muted (with X)
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 6h2.5L7 4v8L4.5 10H2V6z" fill="currentColor" />
          <path d="M10 6l4 4M14 6l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </motion.button>
  );
}
