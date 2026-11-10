/** npm run reset — fresh database, migrations, seed, and cleared uploads/screenshots. */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/lib/config';
import { closeDb } from '../src/lib/db/client';
import { resetAndSeed } from '../src/lib/db/seed';

export function resetAll() {
  const db = path.resolve(config.dbPath);
  closeDb();
  for (const f of [db, `${db}-wal`, `${db}-shm`]) fs.rmSync(f, { force: true });
  for (const d of ['data/uploads', 'data/screenshots']) fs.rmSync(path.join(process.cwd(), d), { recursive: true, force: true });
  const seeded = resetAndSeed();
  closeDb();
  return seeded;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeded = resetAll();
  console.log(`Reset ${config.dbPath}: ${seeded.lines} budget lines, ${seeded.criteria} criteria, ${seeded.precedents} precedents, ${seeded.events} events.`);
}
