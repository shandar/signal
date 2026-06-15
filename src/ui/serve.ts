import { existsSync, statSync, watch } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join, normalize, resolve } from 'node:path';
import { ClaudeAdapter } from '../adapters/claude';
import { CodexAdapter } from '../adapters/codex';
import { type ProviderSummary, aggregateProvider } from '../core/Aggregator';
import { EventStore } from '../core/EventStore';
import { HardwareSampler } from '../core/HardwareSampler';
import { PollScheduler } from '../core/PollScheduler';
import {
  type ClaudeCliInstance,
  detectClaudeCliInstances,
  detectCodexCliInstances,
} from '../core/Processes';
import { ProviderRegistry } from '../core/ProviderRegistry';
import { loadConfig, writeDefaultConfig } from '../core/config';
import type { ProviderId } from '../core/types';

// Resolve the web UI's built static files. In development we ship the Vite
// dev server separately; in production the daemon serves web/dist directly.
function findWebDist(): string | null {
  const candidates = [
    resolve(import.meta.dir, '../../web/dist'),
    resolve(process.cwd(), 'web/dist'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return CONTENT_TYPES[path.slice(dot)] ?? 'application/octet-stream';
}

function localIpAddresses(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

interface ServeOptions {
  port?: number;
}

export async function runServe(opts: ServeOptions = {}): Promise<void> {
  const port = opts.port ?? 8787;
  writeDefaultConfig();
  const cfg = loadConfig();
  const store = new EventStore(cfg.dbPath);
  const registry = new ProviderRegistry();
  registry.register(new ClaudeAdapter({ useOauth: cfg.claude.useOauth }));
  // Codex is always registered — its adapter no-ops gracefully on machines
  // without `~/.codex/sessions/`.
  registry.register(new CodexAdapter());
  const scheduler = new PollScheduler(store);
  for (const a of registry.list()) scheduler.add(a);
  scheduler.start();

  // Print provider detection summary so the user / tester sees what was found.
  const claudeAdapter = registry.get('claude');
  const codexAdapter = registry.get('codex');
  const claudeOk = claudeAdapter ? await claudeAdapter.detect() : false;
  const codexOk = codexAdapter ? await codexAdapter.detect() : false;

  const sampler = new HardwareSampler({ useSystemInformation: cfg.hardware.useSystemInformation });
  const distDir = findWebDist();

  // Watch ~/.claude/projects for instant nudges.
  const claudeProjects = join(homedir(), '.claude', 'projects');
  let watcher: ReturnType<typeof watch> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  if (existsSync(claudeProjects)) {
    try {
      watcher = watch(claudeProjects, { recursive: true }, (_e, filename) => {
        if (!filename || !filename.toString().endsWith('.jsonl')) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          void scheduler.runOnce().then(() => publishSnapshot());
        }, 250);
      });
    } catch {
      // fs.watch recursive unsupported — heartbeat covers it.
    }
  }

  /** Build a wire-safe summary for one provider (ms-epoch timestamps in recent). */
  function summarizeProvider(id: ProviderId, displayName: string): ProviderSummary | null {
    const adapter = registry.get(id);
    if (!adapter) return null;
    const events = store.latestEvents(adapter.id, 500);
    if (events.length === 0) return null;
    return aggregateProvider(events, { provider: id, displayName });
  }

  function toWire(summary: ProviderSummary | null): unknown {
    if (!summary) return null;
    return { ...summary, recent: summary.recent.map((r) => ({ ...r, ts: r.ts.getTime() })) };
  }

  async function snapshot(): Promise<string> {
    const claudeSummary = summarizeProvider('claude', 'Claude Code');
    const codexSummary = summarizeProvider('codex', 'Codex');
    const hw = await sampler.sample();
    store.appendHwSample(hw);

    // Combined process list — Claude + Codex CLI instances.
    const processes: ClaudeCliInstance[] = [
      ...detectClaudeCliInstances(),
      ...detectCodexCliInstances(),
    ];

    return JSON.stringify({
      generatedAt: Date.now(),
      // New multi-provider envelope. Web reads `providers` going forward.
      providers: {
        claude: toWire(claudeSummary),
        codex: toWire(codexSummary),
      },
      // Backward-compat: keep top-level `claude` for any web client that
      // still expects it. Will be removed in a future cleanup.
      claude: toWire(claudeSummary),
      processes,
      hardware: {
        cpuPct: hw.cpuPct,
        cpuPerCore: hw.cpuPerCore,
        memUsedBytes: hw.memUsedBytes,
        memTotalBytes: hw.memTotalBytes,
        load1m: hw.load1m,
        load5m: hw.load5m,
        load15m: hw.load15m,
        gpuPct: hw.gpuPct,
      },
    });
  }

  let lastPayload = '';
  async function publishSnapshot(): Promise<void> {
    const payload = await snapshot();
    lastPayload = payload;
    server.publish('snapshot', payload);
  }

  // Heartbeat publish every 1s so ages and countdowns animate even when
  // no Claude turn has fired. The hardware sample also refreshes on this tick.
  const heartbeat = setInterval(() => {
    void publishSnapshot();
  }, 1000);

  const server = Bun.serve({
    port,
    hostname: '0.0.0.0',
    fetch(req, srv) {
      const url = new URL(req.url);

      // WebSocket upgrade for /ws
      if (url.pathname === '/ws') {
        if (srv.upgrade(req)) return undefined;
        return new Response('websocket upgrade failed', { status: 400 });
      }

      // Health + JSON snapshot endpoints — useful for scripts.
      if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ ok: true, version: '0.2.0' }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.pathname === '/api/snapshot') {
        return new Response(lastPayload || '{}', {
          headers: { 'content-type': 'application/json' },
        });
      }

      // Static files for the web UI.
      if (!distDir) {
        return new Response(
          'web/dist not built. Run `cd web && bun install && bun run build`, then re-run `signal serve`.',
          { status: 503 },
        );
      }
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const filePath = join(distDir, safe);
      // Prevent escaping distDir.
      if (!filePath.startsWith(distDir)) {
        return new Response('forbidden', { status: 403 });
      }
      try {
        const stat = statSync(filePath);
        if (stat.isFile()) {
          return new Response(Bun.file(filePath), {
            headers: { 'content-type': contentTypeFor(filePath) },
          });
        }
      } catch {
        // fall through to SPA fallback
      }
      // SPA fallback — serve index.html for unknown paths so client routing works.
      try {
        return new Response(Bun.file(join(distDir, 'index.html')), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      } catch {
        return new Response('not found', { status: 404 });
      }
    },
    websocket: {
      open(ws) {
        ws.subscribe('snapshot');
        if (lastPayload) ws.send(lastPayload);
      },
      message() {
        // ignore — clients don't send anything yet
      },
    },
  });

  // Prime with one immediate snapshot.
  await publishSnapshot();

  const ips = localIpAddresses();
  console.log(`\n  signal serve  ·  port ${port}`);
  console.log(`  local:   http://localhost:${port}`);
  for (const ip of ips) console.log(`  network: http://${ip}:${port}   ← open on your phone`);
  if (distDir) {
    console.log(`  serving: ${distDir}`);
  } else {
    console.log('  serving: (no web/dist found — UI requests will 503)');
  }
  // Provider detection summary — useful for first-time testers to see at a
  // glance whether their CLI was discovered.
  const provLine: string[] = [];
  provLine.push(claudeOk ? '● Claude' : '○ Claude (no ~/.claude/projects/)');
  provLine.push(codexOk ? '● Codex' : '○ Codex (no ~/.codex/sessions/)');
  console.log(`  providers: ${provLine.join('   ')}`);
  console.log('  ws:      /ws       json: /api/snapshot       health: /api/health');
  console.log('\n  ctrl+c to stop.\n');

  // Keep the process alive until SIGINT.
  await new Promise<void>((resolveStop) => {
    const stop = (): void => {
      clearInterval(heartbeat);
      if (debounce) clearTimeout(debounce);
      watcher?.close();
      scheduler.stop();
      server.stop();
      store.close();
      resolveStop();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}
