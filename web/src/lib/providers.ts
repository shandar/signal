import type { ProviderId, ProviderSummary, SignalSnapshot } from './types';

/** Pull all provider summaries that the daemon has data for. */
export function activeProviders(snapshot: SignalSnapshot | null): ProviderSummary[] {
  if (!snapshot) return [];
  const all: ProviderSummary[] = [];
  // Prefer the new envelope.
  const envelope = snapshot.providers ?? {};
  for (const id of Object.keys(envelope) as ProviderId[]) {
    const s = envelope[id];
    if (s) all.push(s);
  }
  // Fall back to the legacy top-level Claude field for daemons predating the
  // multi-provider wire change.
  if (all.length === 0 && snapshot.claude) {
    all.push({
      ...snapshot.claude,
      provider: snapshot.claude.provider ?? 'claude',
      displayName: snapshot.claude.displayName ?? 'Claude Code',
    });
  }
  return all;
}

/** Pick whichever provider has the most cost (or, ties broken by tokens). */
export function pickPrimaryProvider(
  snapshot: SignalSnapshot | null,
  preferred?: ProviderId,
): ProviderSummary | null {
  const list = activeProviders(snapshot);
  if (list.length === 0) return null;
  if (preferred) {
    const hit = list.find((s) => s.provider === preferred);
    if (hit) return hit;
  }
  return list
    .slice()
    .sort((a, b) => b.costInr - a.costInr || b.tokensWindow - a.tokensWindow)[0]!;
}

/** Display-friendly label for a provider. */
export function providerLabel(id: ProviderId): string {
  switch (id) {
    case 'claude':
      return 'Claude';
    case 'codex':
      return 'Codex';
    case 'cursor':
      return 'Cursor';
    case 'gemini':
      return 'Gemini';
    case 'copilot':
      return 'Copilot';
  }
}

/** Tiny color accent per provider — keeps headers / chips visually distinct. */
export function providerColor(id: ProviderId): string {
  switch (id) {
    case 'claude':
      return '#d97757'; // Anthropic claude-orange
    case 'codex':
      return '#10a37f'; // OpenAI green
    case 'cursor':
      return '#a78bfa';
    case 'gemini':
      return '#4285f4';
    case 'copilot':
      return '#24292f';
  }
}
