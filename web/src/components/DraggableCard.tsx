import { motion, useMotionValue } from 'framer-motion';
import { useEffect, useState } from 'react';
import { type CardOffset, loadLayout, saveCardOffset } from '../lib/layout';

interface Props {
  id: string;
  // CSS-anchored starting box. One of (top, bottom) and one of (left, right)
  // pin the card to its corner; width fixes the size. The drag offset is
  // applied as a transform on top, so cards stay responsive on resize until
  // the user moves them.
  anchor: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
  };
  zIndex?: number;
  children: React.ReactNode;
}

export function DraggableCard({ id, anchor, zIndex = 5, children }: Props): JSX.Element {
  const stored = loadLayout().cards[id];
  const x = useMotionValue(stored?.x ?? 0);
  const y = useMotionValue(stored?.y ?? 0);
  const [collapsed, setCollapsed] = useState(stored?.collapsed ?? false);
  // Track whether a drag is in progress so a click on the body doesn't also
  // count as a tap-to-collapse.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const offset: CardOffset = { x: x.get(), y: y.get(), collapsed };
    saveCardOffset(id, offset);
  }, [collapsed, id, x, y]);

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: anchor.top,
        bottom: anchor.bottom,
        left: anchor.left,
        right: anchor.right,
        width: anchor.width,
        zIndex,
        x,
        y,
        touchAction: 'none', // prevent iOS scroll-while-drag
      }}
      drag
      dragMomentum={false}
      dragElastic={0.05}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_, info) => {
        // Persist final position; the motion values already reflect the new
        // location because of dragMomentum=false + no snapping.
        saveCardOffset(id, { x: x.get() + info.offset.x * 0, y: y.get() + info.offset.y * 0, collapsed });
        // useMotionValue is already updated by drag — the saveCardOffset call
        // above is defensive; the real position is x.get() / y.get().
        saveCardOffset(id, { x: x.get(), y: y.get(), collapsed });
        // Tiny delay so the upcoming onClick doesn't fire.
        setTimeout(() => setDragging(false), 50);
      }}
      whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
      whileHover={{ scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div
        style={{
          position: 'relative',
          background: 'rgba(10, 13, 24, 0.78)',
          border: '1px solid rgba(90, 240, 255, 0.18)',
          borderRadius: 6,
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          overflow: 'hidden',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Drag handle / collapse — small dot strip top-right of the card */}
        <button
          type="button"
          onClick={(e) => {
            if (dragging) return;
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            zIndex: 2,
            width: 20,
            height: 14,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--dim)',
            fontSize: 14,
            lineHeight: 1,
            opacity: 0.6,
          }}
          aria-label={collapsed ? 'expand' : 'collapse'}
        >
          {collapsed ? '▾' : '▴'}
        </button>
        {/* Card body — collapses to a tight height when toggled. */}
        <motion.div
          animate={{ height: collapsed ? 22 : 'auto' }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ overflow: 'hidden', padding: '12px 14px' }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}
