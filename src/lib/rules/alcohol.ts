/**
 * Alcohol detection: flagged if EITHER the keyword list OR Claude's per-item
 * category tag fires. Never relies on the model alone.
 */
const ALCOHOL_PATTERNS: RegExp[] = [
  /\bbeers?\b/i,
  /\bwines?\b/i,
  /\bipas?\b/i,
  /\blagers?\b/i,
  /(?<!ginger )\bales?\b/i,
  /\bstouts?\b/i,
  /\bporters?\b/i,
  /\bhard (cider|seltzer|lemonade)s?\b/i,
  /\bvodka\b/i,
  /\bwhiske?y\b/i,
  /\btequila\b/i,
  /\brum\b/i,
  /\bgin\b/i,
  /\bsake\b/i,
  /\bsoju\b/i,
  /\bchampagne\b/i,
  /\bprosecco\b/i,
  /\bmargaritas?\b/i,
  /\bcocktails?\b/i,
  /\bliquor\b/i,
  /\balcohol(ic)?\b/i,
  /\bbooze\b/i,
  /\bmimosas?\b/i,
  /\b(lagunitas|heineken|corona|modelo|coors|budweiser|bud light|white claw|truly|stella artois|pabst)\b/i,
];

export function alcoholKeywordHits(texts: (string | null | undefined)[]): string[] {
  const hits = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const p of ALCOHOL_PATTERNS) {
      const m = t.match(p);
      if (m) hits.add(m[0].toLowerCase());
    }
  }
  return [...hits];
}

const BANNED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bgift ?cards?\b/i, label: 'gift card' },
  { re: /\b(cash|venmo|zelle|paypal) (prize|payment|transfer|gift)s?\b/i, label: 'cash equivalent' },
  { re: /\bprepaid (visa|card)s?\b/i, label: 'cash equivalent' },
  { re: /\bdonations? to\b/i, label: 'donation' },
  { re: /\bpersonal use\b/i, label: 'personal-use item' },
];

export function bannedHits(texts: (string | null | undefined)[]): string[] {
  const hits = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const b of BANNED_PATTERNS) if (b.re.test(t)) hits.add(b.label);
  }
  return [...hits];
}
