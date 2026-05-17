import { afterEach, describe, expect, mock, test } from 'bun:test';
import { fetchUsage } from '../../../src/adapters/claude/oauth';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('fetchUsage', () => {
  test('parses a 200 response into a UsageResponse', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            five_hour: { utilization: 42, resets_at: '2026-05-17T15:00:00Z' },
            seven_day: { utilization: 18, resets_at: '2026-05-24T00:00:00Z' },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;
    const res = await fetchUsage('token-x');
    expect(res.fiveHour?.utilization).toBe(42);
    expect(res.sevenDay?.utilization).toBe(18);
  });

  test('throws RateLimited on 429', async () => {
    globalThis.fetch = mock(
      async () => new Response('rate limit', { status: 429 }),
    ) as unknown as typeof fetch;
    await expect(fetchUsage('t')).rejects.toThrow(/rate limit/i);
  });

  test('throws TokenExpired on 401', async () => {
    globalThis.fetch = mock(
      async () => new Response('', { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(fetchUsage('t')).rejects.toThrow(/expired/i);
  });
});
