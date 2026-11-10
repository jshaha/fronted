import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Simulator } from '@/components/sim/Simulator';

export const metadata: Metadata = { title: 'Simulator' };
export const dynamic = 'force-dynamic';

export default function SimulatorPage() {
  return (
    <Suspense>
      <Simulator />
    </Suspense>
  );
}
