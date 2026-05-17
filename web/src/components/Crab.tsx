import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { CrabMood } from '../lib/types';

// Animated pixel-art crab. SVG rect grid stays crisp at any zoom and lets us
// react to mood + tap without sprite sheets. Tap to make the crab wave, jump,
// spin, or dance — one reaction picked at random per press.

interface Props {
  mood: CrabMood;
  scale?: number;
  onTap?: () => void;
}

const MOOD_PALETTE: Record<CrabMood, { body: string; light: string; dark: string }> = {
  chill: { body: '#3bc6d6', light: '#65d6f5', dark: '#2b88a0' },
  focused: { body: '#d6c93b', light: '#f5e565', dark: '#a0972b' },
  cooking: { body: '#d6713b', light: '#f59465', dark: '#a04f2b' },
  burning: { body: '#d63b3b', light: '#ff6565', dark: '#a02b2b' },
};

const FACES: Record<
  CrabMood,
  {
    eyes: Array<{ x: number; y: number; c: string }>;
    mouth: { x: number; y: number; w: number; h: number };
  }
> = {
  chill: {
    eyes: [
      { x: 12, y: 12, c: '#fff' },
      { x: 13, y: 13, c: '#0a0d18' },
      { x: 18, y: 12, c: '#fff' },
      { x: 19, y: 13, c: '#0a0d18' },
    ],
    mouth: { x: 14, y: 16, w: 4, h: 1 },
  },
  focused: {
    eyes: [
      { x: 12, y: 12, c: '#fff' },
      { x: 13, y: 12, c: '#0a0d18' },
      { x: 18, y: 12, c: '#fff' },
      { x: 19, y: 12, c: '#0a0d18' },
    ],
    mouth: { x: 13, y: 16, w: 6, h: 1 },
  },
  cooking: {
    eyes: [
      { x: 12, y: 12, c: '#ffd700' },
      { x: 13, y: 13, c: '#0a0d18' },
      { x: 18, y: 12, c: '#ffd700' },
      { x: 19, y: 13, c: '#0a0d18' },
    ],
    mouth: { x: 13, y: 15, w: 6, h: 2 },
  },
  burning: {
    eyes: [
      { x: 12, y: 12, c: '#ff5a6e' },
      { x: 13, y: 13, c: '#fff' },
      { x: 18, y: 12, c: '#ff5a6e' },
      { x: 19, y: 13, c: '#fff' },
    ],
    mouth: { x: 13, y: 15, w: 6, h: 2 },
  },
};

const LEGS_FRAMES = [
  [
    { x: 8, y: 18, h: 2 },
    { x: 12, y: 18, h: 2 },
    { x: 18, y: 18, h: 2 },
    { x: 22, y: 18, h: 2 },
    { x: 7, y: 20, h: 2 },
    { x: 11, y: 20, h: 2 },
    { x: 19, y: 20, h: 2 },
    { x: 23, y: 20, h: 2 },
  ],
  [
    { x: 8, y: 18, h: 3 },
    { x: 12, y: 19, h: 2 },
    { x: 18, y: 19, h: 2 },
    { x: 22, y: 18, h: 3 },
    { x: 7, y: 21, h: 1 },
    { x: 11, y: 21, h: 1 },
    { x: 19, y: 21, h: 1 },
    { x: 23, y: 21, h: 1 },
  ],
];

type Reaction = 'wave' | 'jump' | 'spin' | 'dance' | 'surprise';

const REACTIONS: Reaction[] = ['wave', 'jump', 'spin', 'dance', 'surprise'];

const REACTION_VARIANTS: Record<Reaction, Variants> = {
  wave: {
    play: { rotate: [0, -12, 8, -10, 6, 0], transition: { duration: 0.9, ease: 'easeInOut' } },
  },
  jump: {
    play: {
      y: [0, -40, 0, -16, 0],
      scaleY: [1, 1.05, 0.95, 1.02, 1],
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  },
  spin: {
    play: { rotate: [0, 360], transition: { duration: 0.8, ease: 'easeInOut' } },
  },
  dance: {
    play: {
      x: [0, -10, 12, -10, 12, -8, 8, 0],
      rotate: [0, -5, 5, -5, 5, -3, 3, 0],
      transition: { duration: 1.4, ease: 'easeInOut' },
    },
  },
  surprise: {
    play: {
      scale: [1, 1.18, 1.0, 1.06, 1],
      y: [0, -8, 0, -4, 0],
      transition: { duration: 0.7, ease: 'easeOut' },
    },
  },
};

interface CrabSvgProps {
  mood: CrabMood;
  frame: number;
  blinking: boolean;
  surprised: boolean;
}

function CrabSvg({ mood, frame, blinking, surprised }: CrabSvgProps): JSX.Element {
  const p = MOOD_PALETTE[mood];
  const f = FACES[mood];
  const legs = LEGS_FRAMES[frame % LEGS_FRAMES.length] ?? LEGS_FRAMES[0] ?? [];
  return (
    <svg
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
    >
      <rect x="8" y="10" width="16" height="8" fill={p.body} />
      <rect x="6" y="12" width="2" height="4" fill={p.body} />
      <rect x="24" y="12" width="2" height="4" fill={p.body} />
      <rect x="10" y="8" width="12" height="2" fill={p.body} />
      <rect x="10" y="10" width="2" height="2" fill={p.light} />
      <rect x="20" y="10" width="2" height="2" fill={p.light} />

      <g transform={`translate(0 ${frame === 1 ? -0.5 : 0})`}>
        <rect x="2" y="14" width="4" height="2" fill={p.body} />
        <rect x="0" y="12" width="2" height="2" fill={p.body} />
        <rect x="0" y="16" width="2" height="2" fill={p.body} />
      </g>
      <g transform={`translate(0 ${frame === 0 ? -0.5 : 0})`}>
        <rect x="26" y="14" width="4" height="2" fill={p.body} />
        <rect x="30" y="12" width="2" height="2" fill={p.body} />
        <rect x="30" y="16" width="2" height="2" fill={p.body} />
      </g>

      {/* eyes */}
      {blinking ? (
        <>
          <rect x="12" y="13" width="2" height="1" fill={p.dark} />
          <rect x="18" y="13" width="2" height="1" fill={p.dark} />
        </>
      ) : surprised ? (
        <>
          {/* surprised: bigger whites + tiny pupils */}
          <rect x="11" y="11" width="4" height="4" fill="#fff" />
          <rect x="17" y="11" width="4" height="4" fill="#fff" />
          <rect x="13" y="13" width="1" height="1" fill="#0a0d18" />
          <rect x="19" y="13" width="1" height="1" fill="#0a0d18" />
        </>
      ) : (
        f.eyes.map((e, i) => <rect key={i} x={e.x} y={e.y} width="1" height="1" fill={e.c} />)
      )}

      <rect
        x={surprised ? 14 : f.mouth.x}
        y={surprised ? 16 : f.mouth.y}
        width={surprised ? 4 : f.mouth.w}
        height={surprised ? 3 : f.mouth.h}
        fill="#0a0d18"
        rx={surprised ? 1 : 0}
      />

      {legs.map((l, i) => (
        <rect
          key={`leg${i}`}
          x={l.x}
          y={l.y}
          width="2"
          height={l.h}
          fill={i < 4 ? p.body : p.dark}
        />
      ))}
    </svg>
  );
}

export function Crab({ mood, scale = 6, onTap }: Props): JSX.Element {
  const reactionControls = useAnimationControls();
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [surprised, setSurprised] = useState(false);
  const [frame, setFrame] = useState(0);
  const [blinking, setBlinking] = useState(false);

  // Walk cycle + blink loop.
  useEffect(() => {
    const walkMs =
      mood === 'burning' ? 180 : mood === 'cooking' ? 280 : mood === 'focused' ? 420 : 720;
    const w = setInterval(() => setFrame((f) => 1 - f), walkMs);
    const b = setInterval(
      () => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 140);
      },
      3000 + Math.random() * 3000,
    );
    return () => {
      clearInterval(w);
      clearInterval(b);
    };
  }, [mood]);

  async function trigger(): Promise<void> {
    const pick = REACTIONS[Math.floor(Math.random() * REACTIONS.length)] ?? 'jump';
    setReaction(pick);
    setSurprised(pick === 'surprise');
    onTap?.();
    try {
      await reactionControls.start('play');
    } catch {
      /* interrupted */
    }
    setSurprised(false);
    setReaction(null);
  }

  return (
    <motion.button
      type="button"
      aria-label={`tap crab — currently ${mood}`}
      onClick={() => void trigger()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 32 * scale,
        height: 32 * scale,
        position: 'relative',
        imageRendering: 'pixelated',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        touchAction: 'manipulation',
      }}
      whileTap={{ scale: 0.92 }}
      animate={reactionControls}
      variants={reaction ? REACTION_VARIANTS[reaction] : undefined}
    >
      {/* breathing bob runs continuously underneath the reaction */}
      <motion.div
        style={{ width: '100%', height: '100%' }}
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      >
        <CrabSvg mood={mood} frame={frame} blinking={blinking} surprised={surprised} />
      </motion.div>
    </motion.button>
  );
}
