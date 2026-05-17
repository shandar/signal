const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export class RateLimitedError extends Error {
  constructor() {
    super('Claude usage API rate limited');
  }
}
export class TokenExpiredError extends Error {
  constructor() {
    super('Claude OAuth token expired');
  }
}

export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}
export interface UsageResponse {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDayOpus: UsageWindow | null;
  sevenDaySonnet: UsageWindow | null;
}

function mapWindow(
  w: { utilization?: number; resets_at?: string } | undefined,
): UsageWindow | null {
  if (!w || typeof w.utilization !== 'number') return null;
  return { utilization: w.utilization, resetsAt: w.resets_at ?? null };
}

export async function fetchUsage(accessToken: string): Promise<UsageResponse> {
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'claude-code/1.0',
    },
  });
  if (res.status === 429) throw new RateLimitedError();
  if (res.status === 401) throw new TokenExpiredError();
  if (!res.ok) throw new Error(`Claude usage API HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as Record<string, unknown>;
  return {
    fiveHour: mapWindow(body.five_hour as never),
    sevenDay: mapWindow(body.seven_day as never),
    sevenDayOpus: mapWindow(body.seven_day_opus as never),
    sevenDaySonnet: mapWindow(body.seven_day_sonnet as never),
  };
}
