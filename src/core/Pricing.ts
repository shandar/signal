// Model pricing, USD per million tokens. Covers Anthropic's Claude family
// and OpenAI's Codex / GPT family. Cache-read is dramatically cheaper than
// first-write on both providers, which is why a busy agent session can look
// terrifying in raw tokens but cheap in actual ₹.
//
// Anthropic: https://www.anthropic.com/pricing
// OpenAI:    https://openai.com/api/pricing

export interface ModelPrice {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  cacheWritePerMTokUsd: number;
  cacheReadPerMTokUsd: number;
}

// ── Anthropic ──────────────────────────────────────────────────────────────

const OPUS: ModelPrice = {
  inputPerMTokUsd: 15,
  outputPerMTokUsd: 75,
  cacheWritePerMTokUsd: 18.75,
  cacheReadPerMTokUsd: 1.5,
};

const SONNET: ModelPrice = {
  inputPerMTokUsd: 3,
  outputPerMTokUsd: 15,
  cacheWritePerMTokUsd: 3.75,
  cacheReadPerMTokUsd: 0.3,
};

const HAIKU: ModelPrice = {
  inputPerMTokUsd: 1,
  outputPerMTokUsd: 5,
  cacheWritePerMTokUsd: 1.25,
  cacheReadPerMTokUsd: 0.1,
};

// ── OpenAI (Codex / GPT) ───────────────────────────────────────────────────
// Reasoning tokens (o-series / gpt-5) are billed at the output rate by the
// API; we fold them into the output bucket in Aggregator.ts, so these
// `outputPerMTokUsd` values cover both visible output and reasoning.

const GPT5_CODEX: ModelPrice = {
  // GPT-5 family (Codex defaults to gpt-5.4 / gpt-5-codex variants).
  // $1.25 in / $10 out per MTok with cached input at $0.125.
  inputPerMTokUsd: 1.25,
  outputPerMTokUsd: 10,
  cacheWritePerMTokUsd: 1.25,
  cacheReadPerMTokUsd: 0.125,
};

const O3: ModelPrice = {
  // o3 reasoning model — premium tier.
  inputPerMTokUsd: 2,
  outputPerMTokUsd: 8,
  cacheWritePerMTokUsd: 2,
  cacheReadPerMTokUsd: 0.5,
};

const O4_MINI: ModelPrice = {
  // o4-mini — cheaper reasoning option, popular default for Codex.
  inputPerMTokUsd: 1.1,
  outputPerMTokUsd: 4.4,
  cacheWritePerMTokUsd: 1.1,
  cacheReadPerMTokUsd: 0.275,
};

const GPT4O: ModelPrice = {
  // GPT-4o — non-reasoning workhorse.
  inputPerMTokUsd: 2.5,
  outputPerMTokUsd: 10,
  cacheWritePerMTokUsd: 2.5,
  cacheReadPerMTokUsd: 1.25,
};

export function priceFor(model: string | null): ModelPrice {
  const m = (model ?? '').toLowerCase();
  // Anthropic
  if (m.includes('opus')) return OPUS;
  if (m.includes('haiku')) return HAIKU;
  if (m.includes('sonnet')) return SONNET;
  // OpenAI / Codex
  if (m.includes('gpt-5') || m.includes('codex')) return GPT5_CODEX;
  if (m.includes('o4-mini') || m.includes('o4_mini')) return O4_MINI;
  if (m.includes('o3')) return O3;
  if (m.includes('gpt-4o') || m.includes('gpt4o')) return GPT4O;
  // Default everything unknown to Sonnet — the workhorse — for backward
  // compatibility with the original Claude-only pricing.
  return SONNET;
}

// Exchange rate. Hardcoded for v1; a follow-up can make this configurable
// or pull from an FX feed. Updates monthly are fine — the variance dwarfs
// the cost-per-token precision of Anthropic's pricing.
export const USD_TO_INR = 84;

export interface TokenBuckets {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export function costInr(buckets: TokenBuckets, model: string | null): number {
  const p = priceFor(model);
  const usd =
    (buckets.input / 1_000_000) * p.inputPerMTokUsd +
    (buckets.output / 1_000_000) * p.outputPerMTokUsd +
    (buckets.cacheCreation / 1_000_000) * p.cacheWritePerMTokUsd +
    (buckets.cacheRead / 1_000_000) * p.cacheReadPerMTokUsd;
  return usd * USD_TO_INR;
}

export function formatInr(rupees: number): string {
  if (rupees < 1) return `₹${rupees.toFixed(2)}`;
  if (rupees < 1000) return `₹${rupees.toFixed(0)}`;
  // Indian numbering (lakh/crore) commas: 12,34,567
  const whole = Math.round(rupees);
  const s = whole.toString();
  if (s.length <= 3) return `₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${grouped},${last3}`;
}
