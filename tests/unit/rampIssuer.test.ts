import { describe, expect, it } from 'vitest';
import { RAMP_CATEGORY, rampCategories } from '@/lib/card/rampIssuer';
import { MERCHANT_CATEGORIES } from '@/lib/card/issuer';

describe('Ramp category mapping', () => {
  it('maps every merchant category the app uses', () => {
    for (const c of MERCHANT_CATEGORIES) expect(RAMP_CATEGORY[c], c).toBeTypeOf('number');
  });

  it('dedupes and sorts codes (food lines → restaurants 19 + grocery 17)', () => {
    expect(rampCategories(['restaurants', 'fast_food', 'grocery', 'caterers'])).toEqual([17, 19]);
  });

  it('never allows Alcohol and bars (20) for the seeded food and hardware lines', () => {
    expect(rampCategories(['restaurants', 'fast_food', 'grocery', 'caterers'])).not.toContain(20);
    expect(rampCategories(['electronics', 'hardware_stores', 'online_marketplaces'])).not.toContain(20);
  });
});
