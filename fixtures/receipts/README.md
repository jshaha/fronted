# Receipt Fixtures

These are synthetic receipt images used for testing receipt OCR and parsing.

## Files

- `pizza-clean.png` / `pizza-clean.expected.json` — Telegraph Slice Co., clean transaction with tip
- `pizza-beer.png` / `pizza-beer.expected.json` — Telegraph Slice Co., includes alcohol, no tip
- `hardware-reimbursement.png` / `hardware-reimbursement.expected.json` — Ohm & Co. Electronics, hardware reimbursement

## Hashes

Regenerating these images will change their SHA256 hashes and break any test replay recordings keyed by those hashes. Update those references when you regenerate the fixtures.

## Regenerate

To regenerate all receipts:

```bash
npm run receipts
```

This runs `npx tsx scripts/gen-receipts.ts`, which renders each receipt as HTML, screenshots it with Playwright at 2x scale for crisp text, and generates the expected JSON files.

## Notes

- Amounts are exact and verified in code (line items sum to subtotal, subtotal + tax + tip = total)
- Date format: YYYY-MM-DD
- All amounts are in cents
- Card payment masking follows real receipt format (CARD: VISA **** LAST4)
