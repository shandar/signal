import { useEffect, useState } from 'react';
import { Aquarium } from './components/Aquarium';
import { DataPanel } from './components/DataPanel';
import { moodFromTokens } from './lib/format';
import type { CrabMood } from './lib/types';
import { useSignal } from './lib/useSignal';

const MOODS: CrabMood[] = ['chill', 'focused', 'cooking', 'burning'];

export function App(): JSX.Element {
  const { snapshot, connected, staleMs } = useSignal();

  const [crabXPct, setCrabXPct] = useState(50);
  const dataMood = snapshot ? moodFromTokens(snapshot.claude.tokensWindow) : 'chill';
  // Mood override — set by tapping the mood chip, expires after 8s so the
  // crab snaps back to real data mood.
  const [overrideMood, setOverrideMood] = useState<CrabMood | null>(null);
  const mood: CrabMood = overrideMood ?? dataMood;
  useEffect(() => {
    if (!overrideMood) return;
    const t = setTimeout(() => setOverrideMood(null), 8000);
    return () => clearTimeout(t);
  }, [overrideMood]);

  // The crab strolls slowly across the tank; faster when mood escalates.
  // A tap or override resets the sine to make the response feel immediate.
  useEffect(() => {
    const speedMs =
      mood === 'burning'
        ? 22_000
        : mood === 'cooking'
          ? 36_000
          : mood === 'focused'
            ? 56_000
            : 90_000;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / speedMs;
      const pct = 30 + 40 * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2));
      setCrabXPct(pct);
    }, 80);
    return () => clearInterval(id);
  }, [mood]);

  const cycleMood = (): void => {
    const i = MOODS.indexOf(mood);
    const next = MOODS[(i + 1) % MOODS.length] ?? 'chill';
    setOverrideMood(next);
  };

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Aquarium mood={mood} crabXPct={crabXPct} onCrabTap={cycleMood} />
      <DataPanel
        snapshot={snapshot}
        connected={connected}
        staleMs={staleMs}
        onMoodHack={cycleMood}
      />
    </div>
  );
}
