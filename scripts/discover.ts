/** Dev helper: run the demo scenarios in replay mode against a scratch stack (finds missing recordings). */
import { startStack } from './lib/stack';
import { Driver, runDemoScenarios } from './lib/driver';

async function main() {
  const stack = await startStack({
    port: Number(process.env.DISCOVER_PORT || 3300),
    mode: 'dev',
    env: { CLAUDE_MODE: 'replay', REPLAY_LATENCY_MS: '0', DB_PATH: 'data/discover.sqlite', PORTAL_RUNNER: 'simulated', MOCK_PORTAL_FAST: '1', PORTAL_STEP_DELAY_MS: '0' },
    quiet: !process.env.VERBOSE,
  });
  try {
    await runDemoScenarios(new Driver(stack.baseUrl));
  } finally {
    await stack.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
