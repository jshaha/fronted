import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Simulator } from '@/components/sim/Simulator';

export const metadata: Metadata = { title: 'Treasurer' };
export const dynamic = 'force-dynamic';

export default function TreasurerPage() {
  return (
    <Suspense>
      <Simulator view="treasurer" />
    </Suspense>
  );
}
