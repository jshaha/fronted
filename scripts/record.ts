/**
 * npm run record — re-record every Claude call in the demo with the live API.
 * Needs ANTHROPIC_API_KEY. Uses a scratch database; writes fixtures/replays/**.
 */
import { startStack } from './lib/stack';
import { Driver, runDemoScenarios } from './lib/driver';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('npm run record needs ANTHROPIC_API_KEY (live Claude calls).');
    process.exit(1);
  }
  const port = Number(process.env.RECORD_PORT || 3200);
  const stack = await startStack({
    port,
    mode: 'dev',
    env: { CLAUDE_MODE: 'live', CLAUDE_RECORD: '1', DB_PATH: 'data/record.sqlite', PORTAL_RUNNER: process.env.PORTAL_RUNNER || 'headless', MOCK_PORTAL_FAST: '1', PORTAL_STEP_DELAY_MS: '0' },
    quiet: !process.env.VERBOSE,
  });
  try {
    await runDemoScenarios(new Driver(stack.baseUrl));
    console.log('Recorded. Review the diff in fixtures/replays before committing.');
  } finally {
    await stack.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
