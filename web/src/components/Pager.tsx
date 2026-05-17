import { type PanInfo, motion, useMotionValue } from 'framer-motion';
import { useEffect, useState } from 'react';

interface PagerProps {
  pages: Array<{ id: string; label: string; content: React.ReactNode }>;
  initialIndex?: number;
}

// Horizontal swipe pager. Each page is exactly one viewport wide (`100vw`),
// laid out side-by-side. Swipe with finger on phone, click a dot indicator,
// or use ← / → on desktop. Drags reveal the neighbor visually; releasing
// past 25% of the screen width commits the swap.

export function Pager({ pages, initialIndex = 0 }: PagerProps): JSX.Element {
  const [index, setIndex] = useState(initialIndex);
  const x = useMotionValue(0);
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );

  // Keep width in sync with viewport resize.
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Drive x from index when index changes or width changes.
  useEffect(() => {
    if (width === 0) return;
    x.set(-index * width);
  }, [index, width, x]);

  // Keyboard nav (desktop convenience).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < pages.length - 1) setIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, pages.length]);

  const handleDragEnd = (_: unknown, info: PanInfo): void => {
    const threshold = width * 0.18; // commit at ~18% of screen
    const velocity = info.velocity.x;
    let next = index;
    if (info.offset.x < -threshold || velocity < -350) next = Math.min(index + 1, pages.length - 1);
    else if (info.offset.x > threshold || velocity > 350) next = Math.max(index - 1, 0);
    setIndex(next);
    // Snap to the (possibly same) index.
    x.set(-next * width);
  };

  const totalWidth = width * pages.length;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', touchAction: 'pan-y' }}>
      <motion.div
        drag="x"
        dragConstraints={{ left: -(totalWidth - width), right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        // Tell the browser to handle vertical pan itself — framer-motion's
        // default `touch-action: none` blocks scrolling inside the pages.
        // With `pan-y`, only horizontal gestures reach the drag handler.
        dragDirectionLock
        style={{
          display: 'flex',
          width: totalWidth,
          height: '100%',
          x,
          cursor: 'grab',
          touchAction: 'pan-y',
        }}
        onDragEnd={handleDragEnd}
        whileDrag={{ cursor: 'grabbing' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      >
        {pages.map((p) => (
          <div
            key={p.id}
            style={{
              flex: `0 0 ${width}px`,
              height: '100%',
              position: 'relative',
            }}
          >
            {p.content}
          </div>
        ))}
      </motion.div>

      {/* Page indicator dots */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          zIndex: 10,
          background: 'rgba(10,13,24,0.6)',
          padding: '6px 10px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {pages.map((p, i) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setIndex(i)}
            aria-label={`go to ${p.label}`}
            style={{
              width: i === index ? 22 : 6,
              height: 6,
              padding: 0,
              borderRadius: 3,
              border: 0,
              background: i === index ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.25)',
              boxShadow: i === index ? '0 0 8px var(--neon-cyan)' : undefined,
              cursor: 'pointer',
              transition: 'width 0.25s ease',
            }}
            title={p.label}
          />
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          fontSize: 10,
          color: 'var(--dim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          zIndex: 10,
        }}
      >
        {pages[index]?.label}
      </div>
    </div>
  );
}
