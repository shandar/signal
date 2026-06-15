import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { parseCodexSession } from '../../../src/adapters/codex/jsonl';

const FIXTURES = join(import.meta.dir, '../../fixtures/codex');

describe('parseCodexSession', () => {
  test('extracts one event per token_count record', () => {
    const events = parseCodexSession(join(FIXTURES, 'session-normal.jsonl'));
    // Real fixture has ≥1 token_count record. We don't pin the exact count
    // because Codex may emit them at varying rates per turn.
    expect(events.length).toBeGreaterThan(0);

    const first = events[0];
    expect(first).toBeDefined();
    expect(first?.provider).toBe('codex');
    expect(first?.projectPath).toBe('/Users/tester/example-project');
    // Real model from the fixture is gpt-5.4 (current Codex default).
    expect(first?.model).toBeTruthy();
    // last_token_usage from the first token_count in the fixture has real
    // values — confirm we extracted them rather than defaulting to 0.
    expect((first?.inputTokens ?? 0) + (first?.cacheReadTokens ?? 0)).toBeGreaterThan(0);
  });

  test('skips malformed lines without throwing', () => {
    const events = parseCodexSession(join(FIXTURES, 'session-malformed.jsonl'));
    // Fixture has exactly one valid token_count record.
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e?.inputTokens).toBe(100);
    expect(e?.cacheReadTokens).toBe(50);
    expect(e?.outputTokens).toBe(20);
    expect(e?.reasoningOutputTokens).toBe(10);
    expect(e?.model).toBe('gpt-5-codex');
    expect(e?.sessionId).toBe('sess-bad');
    expect(e?.projectPath).toBe('/Users/tester/proj');
  });

  test('attributes token_count records to the latest turn_context model', () => {
    const events = parseCodexSession(join(FIXTURES, 'session-malformed.jsonl'));
    expect(events[0]?.model).toBe('gpt-5-codex');
  });

  test('reasoning_output_tokens is captured', () => {
    const events = parseCodexSession(join(FIXTURES, 'session-malformed.jsonl'));
    expect(events[0]?.reasoningOutputTokens).toBe(10);
  });
});
