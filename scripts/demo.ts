/**
 * npm run demo — reset + seed, then start the app and the portal worker in
 * replay mode (offline). Ctrl-C stops both.
 *   npm run demo -- --prod      build once, run the production server
 *   npm run demo -- --prod --skip-build   run an existing build (Docker)
 *   PORTAL_RUNNER=headless npm run demo
 */
import { execSync } from 'node:child_process';
import { resetAll } from './reset';
import { startStack } from './lib/stack';

async function main() {
  const prod = process.argv.includes('--prod');
  const port = Number(process.env.PORT || 3000);
  process.env.CLAUDE_MODE ||= 'replay';
  const seeded = resetAll();
  console.log(`Seeded Neurotech@Berkeley: ${seeded.precedents} precedents, ${seeded.criteria} criteria.`);
  if (prod && !process.argv.includes('--skip-build')) execSync('npx next build', { stdio: 'inherit' });
  const stack = await startStack({
    port,
    mode: prod ? 'prod' : 'dev',
    env: { CLAUDE_MODE: process.env.CLAUDE_MODE!, PORTAL_RUNNER: process.env.PORTAL_RUNNER || 'headed' },
  });
  console.log(`\n  Fronted is running (CLAUDE_MODE=${process.env.CLAUDE_MODE}).\n  Simulator:   ${stack.baseUrl}/simulator\n  Mock portal: ${stack.baseUrl}/mock-portal\n  Ctrl-C to stop.\n`);
  const stop = async () => {
    await stack.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise(() => {});
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
