import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aquarium } from './components/Aquarium';
import { DataPanel } from './components/DataPanel';
import { DataPanelMobile } from './components/DataPanelMobile';
import { Pager } from './components/Pager';
import { ProviderSwitcher } from './components/ProviderSwitcher';
import { SettingsView } from './components/SettingsView';
import { SoundToggle } from './components/SoundToggle';
import { Toasts } from './components/Toasts';
import { formatInr } from './lib/format';
import { type Currency, loadCurrency, saveCurrency } from './lib/layout';
import { activeProviders, pickPrimaryProvider } from './lib/providers';
import { type UserSettings, loadSettings, moodFromTokensWithSettings } from './lib/settings';
import type { CrabMood, ProviderId, SignalSnapshot } from './lib/types';
import { useMediaQuery } from './lib/useMediaQuery';
import { useNotifications } from './lib/useNotifications';
import { useSignal } from './lib/useSignal';

const MOODS: CrabMood[] = ['chill', 'focused', 'cooking', 'burning'];

export function App(): JSX.Element {
  const { snapshot, connected, staleMs } = useSignal();
  const [settings, setSettings] = useState<UserSettings>(loadSettings());
  const [currency, setCurrency] = useState<Currency>(loadCurrency());
  const isMobile = useMediaQuery('(max-width: 720px)');

  // Toast notifications — only emit if user has them enabled.
  const { toasts, dismiss } = useNotifications(
    settings.toastsEnabled ? snapshot : null,
  );

  // Currency formatter that respects user-tuned FX rate.
  const formatMoney = useCallback(
    (rupees: number): string => {
      if (currency === 'inr') return formatInr(rupees);
      const rate = settings.usdToInr || 84;
      const usd = rupees / rate;
      if (usd < 1) return `$${usd.toFixed(2)}`;
      if (usd < 1000) return `$${usd.toFixed(2)}`;
      return `$${usd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    },
    [currency, settings.usdToInr],
  );
  const toggleCurrency = (): void => {
    const next: Currency = currency === 'inr' ? 'usd' : 'inr';
    setCurrency(next);
    saveCurrency(next);
  };

  // Multi-provider: pick the user's selected provider, or the dominant one.
  const allProviders = useMemo(() => activeProviders(snapshot), [snapshot]);
  const [providerOverride, setProviderOverride] = useState<ProviderId | null>(null);
  const primary = useMemo(
    () => pickPrimaryProvider(snapshot, providerOverride ?? undefined),
    [snapshot, providerOverride],
  );
  // The existing DataPanel components read `snapshot.claude.*`. Build a
  // back-compat view that mirrors the chosen provider into that slot so we
  // don't have to rewrite every chip in this pass. New components going
  // forward should read `snapshot.providers[id]` directly.
  const adaptedSnapshot: SignalSnapshot | null = useMemo(() => {
    if (!snapshot) return null;
    if (!primary) return snapshot;
    return { ...snapshot, claude: primary };
  }, [snapshot, primary]);

  // Combined-mood: use the dominant provider's spend so the crab heats up
  // for whichever agent is most active.
  const [overrideMood, setOverrideMood] = useState<CrabMood | null>(null);
  const dataMood: CrabMood = primary
    ? moodFromTokensWithSettings(primary.tokensWindow, settings.moodThresholds)
    : 'chill';
  const mood: CrabMood = overrideMood ?? dataMood;
  useEffect(() => {
    if (!overrideMood) return;
    const t = setTimeout(() => setOverrideMood(null), 8000);
    return () => clearTimeout(t);
  }, [overrideMood]);
  const cycleMood = (): void => {
    const i = MOODS.indexOf(mood);
    setOverrideMood(MOODS[(i + 1) % MOODS.length] ?? 'chill');
  };

  // Autonomous crab x-position (sine drift; faster mood = faster drift).
  const [autonomousX, setAutonomousX] = useState(50);
  useEffect(() => {
    const speedMs =
      mood === 'burning' ? 22_000 : mood === 'cooking' ? 36_000 : mood === 'focused' ? 56_000 : 90_000;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / speedMs;
      setAutonomousX(30 + 40 * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2)));
    }, 80);
    return () => clearInterval(id);
  }, [mood]);

  const tankPage = (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Aquarium
        mood={mood}
        autonomousXPct={autonomousX}
        onCrabTap={cycleMood}
        miniGameEnabled={settings.miniGameEnabled}
        soundsEnabled={settings.soundsEnabled}
      />
      {isMobile ? (
        <DataPanelMobile
          snapshot={adaptedSnapshot}
          connected={connected}
          staleMs={staleMs}
          currency={currency}
          onToggleCurrency={toggleCurrency}
          onMoodHack={cycleMood}
          formatMoney={formatMoney}
        />
      ) : (
        <DataPanel
          snapshot={adaptedSnapshot}
          connected={connected}
          staleMs={staleMs}
          onMoodHack={cycleMood}
        />
      )}
    </div>
  );

  const settingsPage = <SettingsView settings={settings} onChange={setSettings} />;

  const updateSounds = (next: boolean): void => {
    const merged = { ...settings, soundsEnabled: next };
    setSettings(merged);
    // Persist so the toggle survives reloads (mirrors SettingsView's save path).
    try {
      window.localStorage.setItem('signal:settings:v1', JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <Pager
        pages={[
          { id: 'tank', label: 'tank', content: tankPage },
          { id: 'settings', label: 'settings', content: settingsPage },
        ]}
      />
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <SoundToggle enabled={settings.soundsEnabled} onToggle={updateSounds} />
      <ProviderSwitcher
        providers={allProviders}
        selectedId={primary?.provider ?? null}
        onSelect={(id) => setProviderOverride(id as ProviderId)}
        formatMoney={formatMoney}
      />
    </>
  );
}
