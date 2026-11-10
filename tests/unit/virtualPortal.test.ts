import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FormSnapshot, PlanStep } from '@/lib/types';
import { snapshotFingerprint } from '@/lib/portal/snapshot';
import { VirtualPortal } from '@/lib/portal/virtualPortal';

// Captured from the real /mock-portal page with Playwright (DUMP_SNAPSHOTS=…).
const captured = (name: string): FormSnapshot =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/portal-snapshots', `${name}.json`), 'utf8'));

/** Re-enter the values the real page held when it was submitted, then submit. */
function replayRound2(snap: FormSnapshot): VirtualPortal {
  const portal = new VirtualPortal('http://localhost:3000/mock-portal');
  const ordered = [...snap.controls].sort((a, b) => Number(b.name === 'Payment Method') - Number(a.name === 'Payment Method'));
  for (const c of ordered) {
    const target = { role: c.role, name: c.name } as PlanStep['target'];
    if (c.role === 'combobox') portal.apply({ action: 'select', target } as PlanStep, c.value);
    else if (c.role === 'textbox' && c.value) portal.apply({ action: 'fill', target } as PlanStep, c.value);
    else if (c.role === 'file' && c.value) portal.apply({ action: 'upload', target } as PlanStep, `/tmp/${c.value}`);
    else if (c.role === 'checkbox' && c.checked) portal.apply({ action: 'check', target } as PlanStep, undefined);
  }
  const res = portal.apply({ action: 'click', target: { role: 'button', name: 'Submit Expense Report' } } as PlanStep, undefined);
  expect(res?.ok).toBe(false);
  return portal;
}

describe('VirtualPortal matches the real portal page', () => {
  it('empty form has the same fingerprint as the captured page (card and personal)', () => {
    const fp = snapshotFingerprint(new VirtualPortal('x').snapshot());
    expect(fp).toBe(snapshotFingerprint(captured('card-r1')));
    expect(fp).toBe(snapshotFingerprint(captured('personal-r1')));
  });

  it.each(['card-r2', 'personal-r2'])('%s: same errors, alerts and fingerprint after a rejected submit', (name) => {
    const real = captured(name);
    const virt = replayRound2(real).snapshot();
    expect(virt.alerts).toEqual(real.alerts);
    expect(virt.controls.map((c) => [c.role, c.name, c.required, c.section, c.error])).toEqual(real.controls.map((c) => [c.role, c.name, c.required, c.section, c.error]));
    expect(snapshotFingerprint(virt)).toBe(snapshotFingerprint(real));
  });

  it('rejects a target that is not on the form', () => {
    const portal = new VirtualPortal('x');
    expect(() => portal.apply({ action: 'fill', target: { role: 'textbox', name: 'Card Last 4 Digits' } } as PlanStep, '1234')).toThrow(/resolved to 0/);
  });
});
