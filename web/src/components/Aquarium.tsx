import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playFootstep, playSparkle, playSplash, unlockAudio } from '../lib/sounds';
import type { CrabMood } from '../lib/types';
import { Crab } from './Crab';

// The tank: gradient sky→water column, caustic flicker, bubbles, kelp,
// pebble floor. The crab walks autonomously by default, but when food
// pellets are dropped (tap the water) it pursues the nearest one.

interface BubbleProps {
  left: number;
  delay: number;
  duration: number;
  size: number;
}

function Bubble({ left, delay, duration, size }: BubbleProps): JSX.Element {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${left}%`,
        bottom: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)',
        boxShadow: 'inset -1px -1px 0 rgba(255,255,255,0.4)',
        pointerEvents: 'none',
      }}
      initial={{ y: 0, opacity: 0 }}
      animate={{ y: '-90vh', opacity: [0, 1, 1, 0], x: [0, 6, -6, 0] }}
      transition={{
        duration,
        delay,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'linear',
        x: { duration: duration / 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay },
      }}
    />
  );
}

function Kelp({ left }: { left: number }): JSX.Element {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${left}%`,
        bottom: 0,
        width: 6,
        height: 180,
        background: 'linear-gradient(to top, #1d6b3a, #2da14e 60%, #1d6b3a 100%)',
        borderRadius: '3px',
        transformOrigin: 'bottom center',
        boxShadow: '0 0 12px rgba(45, 161, 78, 0.3)',
      }}
      animate={{ rotate: [-3, 3, -3] }}
      transition={{ duration: 4 + Math.random() * 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    />
  );
}

interface FoodPellet {
  id: string;
  xPct: number; // horizontal position on the floor
  spawnedAt: number;
  // false until it's reached the floor; true once the crab can eat it.
  landed: boolean;
}

interface Props {
  mood: CrabMood;
  // 0..100, base autonomous position
  autonomousXPct: number;
  onCrabTap?: () => void;
  miniGameEnabled?: boolean;
  soundsEnabled?: boolean;
  onFoodEaten?: () => void;
}

const FLOOR_OFFSET_PX = 18; // crab's bottom offset
// Tight contact distance — the crab must visually arrive at the food
// before eating, so the threshold is roughly one pixel-art tile.
const EAT_DISTANCE_PCT = 1.2;

export function Aquarium({
  mood,
  autonomousXPct,
  onCrabTap,
  miniGameEnabled = true,
  soundsEnabled = true,
  onFoodEaten,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [food, setFood] = useState<FoodPellet[]>([]);
  const [crabXPct, setCrabXPct] = useState(autonomousXPct);
  const [score, setScore] = useState(0);
  // Sparkle animation triggered when food is eaten.
  const [sparkles, setSparkles] = useState<Array<{ id: string; xPct: number }>>([]);

  const bubbles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: Math.random() * 100,
        delay: i * 0.45,
        duration: 6 + Math.random() * 5,
        size: 4 + Math.round(Math.random() * 8),
      })),
    [],
  );
  const kelpPositions = useMemo(() => [6, 22, 78, 92], []);

  // Tap-to-feed. Uses onClick only — onClick is a stationary-tap gesture in
  // browsers, which means a horizontal swipe (handled by the parent Pager's
  // drag) won't trigger this. Don't add onTouchEnd here or every swipe-end
  // becomes a feed event.
  const handleTankClick = useCallback(
    (e: React.MouseEvent) => {
      // Any tap unlocks the audio context on mobile (no-op after first time).
      unlockAudio();
      if (!miniGameEnabled) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const xPct = (xPx / rect.width) * 100;
      if (xPct < 2 || xPct > 98) return;
      setFood((f) =>
        [
          ...f,
          { id: `food-${Date.now()}-${Math.random()}`, xPct, spawnedAt: Date.now(), landed: false },
        ].slice(-12),
      );
      if (soundsEnabled) playSplash();
    },
    [miniGameEnabled, soundsEnabled],
  );

  // Crab AI: every tick, walk toward the nearest landed food. If none, ease
  // back to the autonomous sine position. Stop motion when within
  // EAT_DISTANCE_PCT of the target so the crab visually arrives.
  useEffect(() => {
    const id = setInterval(() => {
      setCrabXPct((current) => {
        const targets = food.filter((p) => p.landed);
        const nearest = targets.reduce<FoodPellet | null>((best, p) => {
          if (!best) return p;
          return Math.abs(p.xPct - current) < Math.abs(best.xPct - current) ? p : best;
        }, null);
        const target = nearest ? nearest.xPct : autonomousXPct;
        const speed = nearest ? (mood === 'burning' ? 2.4 : 1.4) : 0.4;
        const diff = target - current;
        // Eat when we're physically on top of the food.
        if (nearest && Math.abs(diff) < EAT_DISTANCE_PCT) {
          setFood((f) => f.filter((p) => p.id !== nearest.id));
          setSparkles((s) => [...s, { id: `spark-${Date.now()}`, xPct: nearest.xPct }].slice(-6));
          setScore((sc) => sc + 1);
          if (soundsEnabled) playSparkle();
          onFoodEaten?.();
          return nearest.xPct; // settle exactly on the food's spot
        }
        if (Math.abs(diff) < 0.2) return current;
        const step = Math.sign(diff) * Math.min(speed, Math.abs(diff));
        return current + step;
      });
    }, 60);
    return () => clearInterval(id);
  }, [food, autonomousXPct, mood, soundsEnabled, onFoodEaten]);

  // Footstep audio — synced to actual leg movement instead of a wall clock.
  // We accumulate horizontal distance the crab has traveled; every time it
  // crosses a per-step threshold we fire one tick. Faster crab = more ticks
  // per second; stationary crab = silence. This naturally matches the SVG
  // animation's visible leg movement without us having to peek inside its
  // own CSS keyframes.
  const stepAccumRef = useRef(0);
  const prevXRef = useRef(crabXPct);
  useEffect(() => {
    if (!soundsEnabled) {
      stepAccumRef.current = 0;
      return;
    }
    const STEP_DISTANCE_PCT = 2.2; // one tick per ~2.2% of viewport traveled
    const dx = Math.abs(crabXPct - prevXRef.current);
    prevXRef.current = crabXPct;
    // Don't accumulate tiny noise / spring overshoot.
    if (dx < 0.05) return;
    stepAccumRef.current += dx;
    while (stepAccumRef.current >= STEP_DISTANCE_PCT) {
      playFootstep();
      stepAccumRef.current -= STEP_DISTANCE_PCT;
    }
  }, [crabXPct, soundsEnabled]);

  // Mark food as landed once their fall animation should be done (~600ms).
  useEffect(() => {
    if (food.length === 0) return;
    const id = setTimeout(() => {
      setFood((f) =>
        f.map((p) => (Date.now() - p.spawnedAt > 600 ? { ...p, landed: true } : p)),
      );
    }, 120);
    return () => clearTimeout(id);
  }, [food]);

  // Sparkles fade out.
  useEffect(() => {
    if (sparkles.length === 0) return;
    const id = setTimeout(() => setSparkles((s) => s.slice(1)), 800);
    return () => clearTimeout(id);
  }, [sparkles]);

  return (
    <div
      ref={containerRef}
      onClick={handleTankClick}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to bottom, var(--water-top) 0%, var(--water-bot) 100%)',
        overflow: 'hidden',
        cursor: miniGameEnabled ? 'pointer' : 'default',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 30% at 30% 0%, rgba(120,200,255,0.18), transparent 60%), radial-gradient(ellipse 50% 20% at 70% 5%, rgba(120,200,255,0.12), transparent 60%)',
          mixBlendMode: 'screen',
        }}
        animate={{ opacity: [0.6, 1, 0.7, 1, 0.6] }}
        transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      />

      {bubbles.map((b, i) => (
        <Bubble key={i} {...b} />
      ))}
      {kelpPositions.map((l) => (
        <Kelp key={l} left={l} />
      ))}

      {/* Floor */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 40,
          background:
            'repeating-linear-gradient(90deg, #2a3550 0px, #2a3550 6px, #3a4a70 6px, #3a4a70 12px), linear-gradient(to bottom, transparent, #050811 100%)',
          boxShadow: 'inset 0 8px 12px rgba(0,0,0,0.45)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 38,
          height: 8,
          background: 'linear-gradient(to bottom, rgba(120,200,255,0.18), transparent)',
        }}
      />

      {/* Food pellets */}
      <AnimatePresence>
        {food.map((p) => (
          <motion.div
            key={p.id}
            initial={{ top: '20%', opacity: 0 }}
            animate={{ top: `calc(100% - ${FLOOR_OFFSET_PX + 12}px)`, opacity: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.6, ease: 'easeIn' }}
            style={{
              position: 'absolute',
              left: `${p.xPct}%`,
              width: 8,
              height: 8,
              marginLeft: -4,
              borderRadius: 4,
              background: 'radial-gradient(circle, #ffd700, #b3870b)',
              boxShadow: '0 0 8px rgba(255, 215, 0, 0.5)',
              pointerEvents: 'none',
            }}
          />
        ))}
      </AnimatePresence>

      {/* Eat sparkles */}
      <AnimatePresence>
        {sparkles.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 1, scale: 0.6 }}
            animate={{ opacity: 0, scale: 2.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: `${s.xPct}%`,
              bottom: FLOOR_OFFSET_PX + 20,
              width: 24,
              height: 24,
              marginLeft: -12,
              borderRadius: 12,
              background: 'radial-gradient(circle, rgba(255,215,0,0.8), transparent 60%)',
              pointerEvents: 'none',
            }}
          />
        ))}
      </AnimatePresence>

      {/* Score */}
      {miniGameEnabled && score > 0 ? (
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 12,
            fontSize: 11,
            color: 'var(--neon-yellow)',
            background: 'rgba(10,13,24,0.7)',
            padding: '4px 8px',
            borderRadius: 999,
            border: '1px solid rgba(255,215,0,0.3)',
          }}
        >
          🦀 fed × {score}
        </div>
      ) : null}

      {/* Crab */}
      <motion.div
        style={{ position: 'absolute', bottom: FLOOR_OFFSET_PX, pointerEvents: 'none', zIndex: 4 }}
        animate={{ left: `calc(${crabXPct}% - 96px)` }}
        transition={{ type: 'spring', stiffness: 60, damping: 18 }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <Crab mood={mood} scale={6} onTap={onCrabTap} />
        </div>
      </motion.div>

      {/* Hint, shown briefly */}
      {miniGameEnabled && score === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.65, 0.65, 0] }}
          transition={{ duration: 6, times: [0, 0.15, 0.85, 1] }}
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'var(--dim)',
            fontSize: 11,
            pointerEvents: 'none',
            background: 'rgba(10,13,24,0.55)',
            padding: '4px 10px',
            borderRadius: 999,
          }}
        >
          tap the water to feed the crab
        </motion.div>
      ) : null}
    </div>
  );
}
