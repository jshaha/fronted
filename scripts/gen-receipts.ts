import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

interface LineItem {
  description: string;
  quantity: number;
  amount_cents: number; // per unit
  category: 'food' | 'beverage_nonalcoholic' | 'alcohol' | 'hardware';
}

interface Receipt {
  fixture: string;
  merchant_name: string;
  merchant_address: string;
  merchant_phone: string;
  receipt_date: string;
  order_id: string;
  time: string;
  line_items: LineItem[];
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number | null;
  total_cents: number;
  payment_last4: string;
  contains_alcohol: boolean;
  extra_message?: string;
  server_name?: string;
  receipt_type: 'order' | 'invoice'; // 'order' for restaurants, 'invoice' for hardware
}

// Verify arithmetic for a receipt
function verifyReceipt(receipt: Receipt): void {
  let calculated_subtotal = 0;
  for (const item of receipt.line_items) {
    const line_total = item.quantity * item.amount_cents;
    calculated_subtotal += line_total;
  }

  if (calculated_subtotal !== receipt.subtotal_cents) {
    throw new Error(
      `Subtotal mismatch for ${receipt.fixture}: expected ${receipt.subtotal_cents}, got ${calculated_subtotal}`
    );
  }

  const tip = receipt.tip_cents ?? 0;
  const expected_total = receipt.subtotal_cents + receipt.tax_cents + tip;

  if (expected_total !== receipt.total_cents) {
    throw new Error(
      `Total mismatch for ${receipt.fixture}: expected ${receipt.total_cents}, got ${expected_total}`
    );
  }
}

// Define the three receipts with exact data
const receipts: Receipt[] = [
  {
    fixture: 'pizza-clean',
    merchant_name: 'Telegraph Slice Co.',
    merchant_address: '2511 Telegraph Ave, Berkeley, CA 94704',
    merchant_phone: '(510) 555-0142',
    receipt_date: '2026-11-12',
    order_id: 'A-3381',
    time: '6:42 PM',
    server_name: 'Dee',
    receipt_type: 'order',
    line_items: [
      {
        description: 'Large Cheese Pizza',
        quantity: 2,
        amount_cents: 1750,
        category: 'food',
      },
      {
        description: 'Garlic Knots (12)',
        quantity: 1,
        amount_cents: 600,
        category: 'food',
      },
    ],
    subtotal_cents: 4100,
    tax_cents: 420,
    tip_cents: 353,
    total_cents: 4873,
    payment_last4: '4821',
    contains_alcohol: false,
  },
  {
    fixture: 'pizza-beer',
    merchant_name: 'Telegraph Slice Co.',
    merchant_address: '2511 Telegraph Ave, Berkeley, CA 94704',
    merchant_phone: '(510) 555-0142',
    receipt_date: '2026-11-12',
    order_id: 'A-3394',
    time: '7:05 PM',
    receipt_type: 'order',
    line_items: [
      {
        description: 'Large Cheese Pizza',
        quantity: 2,
        amount_cents: 1750,
        category: 'food',
      },
      {
        description: 'Garlic Knots (12)',
        quantity: 1,
        amount_cents: 600,
        category: 'food',
      },
      {
        description: 'Lagunitas IPA 6-Pack',
        quantity: 1,
        amount_cents: 1299,
        category: 'alcohol',
      },
    ],
    subtotal_cents: 5399,
    tax_cents: 553,
    tip_cents: null,
    total_cents: 5952,
    payment_last4: '4821',
    contains_alcohol: true,
  },
  {
    fixture: 'hardware-reimbursement',
    merchant_name: 'Ohm & Co. Electronics',
    merchant_address: '1820 University Ave, Berkeley, CA 94703',
    merchant_phone: '',
    receipt_date: '2026-11-06',
    order_id: 'OC-55120',
    time: '2:15 PM',
    receipt_type: 'invoice',
    line_items: [
      {
        description: 'Gold Cup EEG Electrodes (10 pk)',
        quantity: 2,
        amount_cents: 2495,
        category: 'hardware',
      },
      {
        description: 'Ten20 Conductive Paste (3 × 4oz)',
        quantity: 1,
        amount_cents: 1850,
        category: 'hardware',
      },
      {
        description: 'Shielded Snap Lead Wires (5 pk)',
        quantity: 1,
        amount_cents: 997,
        category: 'hardware',
      },
    ],
    subtotal_cents: 7837,
    tax_cents: 803,
    tip_cents: null,
    total_cents: 8640,
    payment_last4: '7733',
    contains_alcohol: false,
    extra_message: 'Thank you! No returns on opened consumables.',
  },
];

// Verify all receipts
for (const receipt of receipts) {
  verifyReceipt(receipt);
}

// Generate HTML for a receipt
function generateReceiptHTML(receipt: Receipt): string {
  const formatCents = (cents: number): string => {
    return (cents / 100).toFixed(2);
  };

  const headerPhone = receipt.merchant_phone
    ? `${receipt.merchant_phone}`
    : '';

  const [yy, mm, dd] = receipt.receipt_date.split('-');
  const printedDate = `${mm}/${dd}/${yy}`;
  const orderInfo = receipt.server_name
    ? `${receipt.receipt_type === 'order' ? 'Order' : 'Invoice'} #${receipt.order_id} | Server: ${receipt.server_name}<br>${printedDate} ${receipt.time}`
    : `${receipt.receipt_type === 'order' ? 'Order' : 'Invoice'} #${receipt.order_id}<br>${printedDate} ${receipt.time}`;

  let itemsHTML = '';
  for (const item of receipt.line_items) {
    const line_total = (item.quantity * item.amount_cents) / 100;
    itemsHTML += `
    <tr>
      <td style="text-align: left; padding: 4px 0;">${item.quantity}x ${item.description}</td>
      <td style="text-align: right; padding: 4px 0;">$${line_total.toFixed(2)}</td>
    </tr>
    `;
  }

  let totalsHTML = `
    <tr style="border-top: 1px dashed #333;">
      <td style="text-align: left; padding: 6px 0; font-weight: bold;">Subtotal</td>
      <td style="text-align: right; padding: 6px 0; font-weight: bold;">$${formatCents(receipt.subtotal_cents)}</td>
    </tr>
    <tr>
      <td style="text-align: left; padding: 4px 0;">Sales Tax (10.25%)</td>
      <td style="text-align: right; padding: 4px 0;">$${formatCents(receipt.tax_cents)}</td>
    </tr>
  `;

  if (receipt.tip_cents !== null) {
    totalsHTML += `
    <tr>
      <td style="text-align: left; padding: 4px 0;">Tip</td>
      <td style="text-align: right; padding: 4px 0;">$${formatCents(receipt.tip_cents)}</td>
    </tr>
    `;
  }

  totalsHTML += `
    <tr style="border-top: 1px dashed #333; border-bottom: 1px dashed #333;">
      <td style="text-align: left; padding: 8px 0; font-size: 16px; font-weight: bold;">TOTAL</td>
      <td style="text-align: right; padding: 8px 0; font-size: 16px; font-weight: bold;">$${formatCents(receipt.total_cents)}</td>
    </tr>
  `;

  const barcodeHTML = `
    <div style="display: flex; justify-content: center; gap: 1px; padding: 12px 0; font-size: 10px; letter-spacing: 1px;">
      ${[...Array(24)]
        .map(
          () => `<div style="width: 2px; height: 24px; background: #000;"></div>`
        )
        .join('')}
    </div>
    <div style="text-align: center; font-size: 10px; letter-spacing: 1px; font-family: monospace;">84736291</div>
  `;

  const extraMessageHTML = receipt.extra_message
    ? `<div style="text-align: center; font-size: 11px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #333;">${receipt.extra_message}</div>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt</title>
  <style>
    body {
      margin: 0;
      padding: 8px;
      background: #f5f5f5;
      font-family: "Courier New", monospace;
    }
    #receipt {
      width: 380px;
      padding: 16px;
      background: linear-gradient(to bottom, #fefef8 0%, #fffef9 100%);
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin: 0 auto;
      color: #333;
      font-size: 13px;
      line-height: 1.4;
    }
    .header {
      text-align: center;
      margin-bottom: 12px;
      border-bottom: 1px dashed #333;
      padding-bottom: 12px;
    }
    .merchant-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .merchant-details {
      font-size: 11px;
    }
    .order-info {
      text-align: center;
      font-size: 11px;
      padding: 8px 0;
      border-top: 1px dashed #333;
      border-bottom: 1px dashed #333;
      margin: 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
    }
    td {
      padding: 0;
      font-size: 13px;
    }
    .payment-line {
      text-align: center;
      font-size: 11px;
      padding: 8px 0;
      border-top: 1px dashed #333;
    }
  </style>
</head>
<body>
  <div id="receipt">
    <div class="header">
      <div class="merchant-name">${receipt.merchant_name}</div>
      <div class="merchant-details">
        ${receipt.merchant_address}<br>
        ${headerPhone}
      </div>
    </div>

    <div class="order-info">
      ${orderInfo}
    </div>

    <table>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>

    <table>
      <tbody>
        ${totalsHTML}
      </tbody>
    </table>

    <div class="payment-line">
      CARD: ${receipt.payment_last4.includes('VISA') ? 'VISA **** ' : receipt.payment_last4.includes('MASTERCARD') ? 'MASTERCARD **** ' : 'VISA **** '}${receipt.payment_last4}
    </div>

    ${barcodeHTML}
    ${extraMessageHTML}
  </div>
</body>
</html>
  `;

  return html;
}

// Generate expected JSON for a receipt
function generateExpectedJSON(
  receipt: Receipt
): {
  fixture: string;
  merchant_name: string;
  receipt_date: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    amount_cents: number;
    category: string;
  }>;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number | null;
  total_cents: number;
  payment_last4: string;
  contains_alcohol: boolean;
} {
  return {
    fixture: receipt.fixture,
    merchant_name: receipt.merchant_name,
    receipt_date: receipt.receipt_date,
    line_items: receipt.line_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.amount_cents,
      amount_cents: item.quantity * item.amount_cents,
      category: item.category,
    })),
    subtotal_cents: receipt.subtotal_cents,
    tax_cents: receipt.tax_cents,
    tip_cents: receipt.tip_cents,
    total_cents: receipt.total_cents,
    payment_last4: receipt.payment_last4,
    contains_alcohol: receipt.contains_alcohol,
  };
}

async function main() {
  const fixturesDir = path.join(
    path.dirname(__filename),
    '..',
    'fixtures',
    'receipts'
  );

  // Create fixtures directory if it doesn't exist
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  // Set a realistic device scale for crisp text
  await page.setViewportSize({ width: 420, height: 600 });

  const results: { fixture: string; file: string; hash: string }[] = [];

  for (const receipt of receipts) {
    console.log(`Generating ${receipt.fixture}...`);

    // Generate and set HTML
    const html = generateReceiptHTML(receipt);
    await page.setContent(html);

    // Take screenshot of the receipt element
    const receiptElement = await page.locator('#receipt');
    const screenshotPath = path.join(fixturesDir, `${receipt.fixture}.png`);

    // Screenshot with scale factor 2 for crisp text
    await receiptElement.screenshot({
      path: screenshotPath,
      scale: 'device',
    });

    // Calculate file hash
    const fileContent = fs.readFileSync(screenshotPath);
    const hash = crypto
      .createHash('sha256')
      .update(fileContent)
      .digest('hex')
      .substring(0, 16);

    results.push({
      fixture: receipt.fixture,
      file: screenshotPath,
      hash,
    });

    // Generate and write expected JSON
    const expectedJSON = generateExpectedJSON(receipt);
    const jsonPath = path.join(fixturesDir, `${receipt.fixture}.expected.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(expectedJSON, null, 2) + '\n');

    console.log(`✓ ${receipt.fixture}.png (${hash})`);
    console.log(`✓ ${receipt.fixture}.expected.json (${hash})`);
  }

  // Close browser
  await context.close();
  await browser.close();

  // Write README
  const readmePath = path.join(fixturesDir, 'README.md');
  const readmeContent = `# Receipt Fixtures

These are synthetic receipt images used for testing receipt OCR and parsing.

## Files

- \`pizza-clean.png\` / \`pizza-clean.expected.json\` — Telegraph Slice Co., clean transaction with tip
- \`pizza-beer.png\` / \`pizza-beer.expected.json\` — Telegraph Slice Co., includes alcohol, no tip
- \`hardware-reimbursement.png\` / \`hardware-reimbursement.expected.json\` — Ohm & Co. Electronics, hardware reimbursement

## Hashes

Regenerating these images will change their SHA256 hashes and break any test replay recordings keyed by those hashes. Update those references when you regenerate the fixtures.

## Regenerate

To regenerate all receipts:

\`\`\`bash
npm run receipts
\`\`\`

This runs \`npx tsx scripts/gen-receipts.ts\`, which renders each receipt as HTML, screenshots it with Playwright at 2x scale for crisp text, and generates the expected JSON files.

## Notes

- Amounts are exact and verified in code (line items sum to subtotal, subtotal + tax + tip = total)
- Date format: YYYY-MM-DD
- All amounts are in cents
- Card payment masking follows real receipt format (CARD: VISA **** LAST4)
`;

  fs.writeFileSync(readmePath, readmeContent);
  console.log(`✓ README.md`);

  // Print results
  console.log('\n=== Generation Complete ===');
  for (const result of results) {
    console.log(`${result.fixture}: ${result.hash}`);
  }
}

main().catch(console.error);
