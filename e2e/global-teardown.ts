async function globalTeardown() {
  const pid = (globalThis as any).__WORKER_PID__;
  if (pid) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // Already killed
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Already killed
    }
  }
}

export default globalTeardown;
