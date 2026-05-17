// Persisted card-drag offsets. Each card has a stable `id`; its CSS anchor
// (top/left/right/bottom) stays fixed, and we just remember an (x, y) offset
// applied as a transform. That keeps responsive anchoring while letting the
// user pin cards wherever they want.

const STORAGE_KEY = 'signal:layout:v1';

export interface CardOffset {
  x: number;
  y: number;
  collapsed?: boolean;
}

interface Layout {
  cards: Record<string, CardOffset>;
}

function emptyLayout(): Layout {
  return { cards: {} };
}

export function loadLayout(): Layout {
  if (typeof window === 'undefined') return emptyLayout();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLayout();
    const parsed = JSON.parse(raw) as Layout;
    return parsed.cards ? parsed : emptyLayout();
  } catch {
    return emptyLayout();
  }
}

export function saveCardOffset(id: string, offset: CardOffset): void {
  if (typeof window === 'undefined') return;
  const current = loadLayout();
  current.cards[id] = offset;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function resetLayout(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// Currency preference is layout-adjacent — persist it the same way.
const CURRENCY_KEY = 'signal:currency:v1';
export type Currency = 'inr' | 'usd';

export function loadCurrency(): Currency {
  if (typeof window === 'undefined') return 'inr';
  return (window.localStorage.getItem(CURRENCY_KEY) as Currency) ?? 'inr';
}

export function saveCurrency(c: Currency): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CURRENCY_KEY, c);
}
