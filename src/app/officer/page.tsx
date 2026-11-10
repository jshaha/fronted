import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Simulator } from '@/components/sim/Simulator';

export const metadata: Metadata = { title: 'Officer' };
export const dynamic = 'force-dynamic';

export default function OfficerPage() {
  return (
    <Suspense>
      <Simulator view="officer" />
    </Suspense>
  );
}
