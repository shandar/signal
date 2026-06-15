import { Box, Text, render } from 'ink';
import React from 'react';
import { ClaudeAdapter } from '../adapters/claude';
import { CodexAdapter } from '../adapters/codex';
import { HardwareSampler } from '../core/HardwareSampler';
import { configPath, loadConfig } from '../core/config';

export async function runDoctor(): Promise<number> {
  const cfg = loadConfig();

  // Claude
  const claude = new ClaudeAdapter({ useOauth: cfg.claude.useOauth });
  const claudeDetected = await claude.detect();
  const claudeAuth = await claude.authStatus();
  const claudeMode = cfg.claude.useOauth ? 'OAuth (exact %)' : 'JSONL (tokens, no keychain access)';
  const claudeRem = claudeAuth.kind === 'needs_auth' ? ` — ${claudeAuth.remediation}` : '';

  // Codex
  const codex = new CodexAdapter();
  const codexDetected = await codex.detect();
  // Best-effort: how many recent events did we find? Helpful for the tester
  // to know there's actually data behind the detection.
  let codexEventCount = 0;
  if (codexDetected) {
    try {
      const events = await codex.pollOnce();
      codexEventCount = events.length;
    } catch {
      /* swallow */
    }
  }

  // Hardware
  let hwOk = false;
  let hwNote = '';
  try {
    const s = await new HardwareSampler().sample();
    hwOk = s.memTotalBytes > 0 && s.cpuPct >= 0;
    const memPct = ((s.memUsedBytes / s.memTotalBytes) * 100).toFixed(0);
    const gpu = s.gpuPct === null ? 'n/a' : `${s.gpuPct.toFixed(0)}%`;
    hwNote = `cpu ${s.cpuPct.toFixed(0)}% · ram ${memPct}% · gpu ${gpu}`;
  } catch (e) {
    hwNote = e instanceof Error ? e.message : String(e);
  }

  const { unmount } = render(
    <Box flexDirection="column" borderStyle="single">
      <Box paddingX={1}>
        <Text bold>signal doctor</Text>
      </Box>
      <Box paddingX={1}>
        <Text>
          config: <Text color="cyan">{configPath()}</Text>
        </Text>
      </Box>

      {/* Providers section */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>providers</Text>
      </Box>

      {/* Claude */}
      <Box paddingX={1}>
        <Text>
          ● Claude:{' '}
          <Text color={claudeDetected ? 'green' : 'red'}>
            {claudeDetected ? 'detected' : 'not installed'}
          </Text>{' '}
          <Text dimColor>({claudeMode})</Text>
        </Text>
      </Box>
      {cfg.claude.useOauth && claudeDetected ? (
        <Box paddingX={1}>
          <Text>
            {'  '}auth:{' '}
            <Text color={claudeAuth.kind === 'ok' ? 'green' : 'yellow'}>{claudeAuth.kind}</Text>
            {claudeRem}
          </Text>
        </Box>
      ) : null}

      {/* Codex */}
      <Box paddingX={1}>
        <Text>
          ● Codex:{' '}
          <Text color={codexDetected ? 'green' : 'red'}>
            {codexDetected ? 'detected' : 'not installed'}
          </Text>{' '}
          {codexDetected ? (
            <Text dimColor>
              ({codexEventCount} recent event{codexEventCount === 1 ? '' : 's'})
            </Text>
          ) : (
            <Text dimColor>(no ~/.codex/sessions/)</Text>
          )}
        </Text>
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Text>
          hardware: <Text color={hwOk ? 'green' : 'red'}>{hwOk ? 'ok' : 'fail'}</Text> — {hwNote}
        </Text>
      </Box>
    </Box>,
  );
  unmount();
  // "Ok" means: at least one provider detected, auth ok (if applicable), hardware ok.
  const anyProvider = claudeDetected || codexDetected;
  const claudeAuthOk = !cfg.claude.useOauth || !claudeDetected || claudeAuth.kind === 'ok';
  return anyProvider && claudeAuthOk && hwOk ? 0 : 1;
}
