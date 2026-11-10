import { Page, APIRequestContext, expect } from '@playwright/test';
import type { AppState, RequestView } from '../src/lib/view';

/**
 * Reset the app state by calling POST /api/dev/reset
 */
export async function reset(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/dev/reset');
  expect(response.ok()).toBeTruthy();
}

/**
 * Send a message to the officer pane
 */
export async function sendOfficer(page: Page, text: string): Promise<void> {
  const input = page.locator('input[aria-label="Message to Fronted"]');
  await input.fill(text);
  await input.press('Enter');
  // Wait for the message to be sent and processed
  await page.waitForTimeout(2000);
}

/**
 * Poll the /api/state endpoint until the request reaches one of the target statuses
 */
export async function waitForStatus(
  request: APIRequestContext,
  shortId: string,
  statuses: string[],
  timeoutMs = 90_000
): Promise<RequestView> {
  const start = Date.now();
  let lastStatus = '';
  while (Date.now() - start < timeoutMs) {
    const response = await request.get('/api/state');
    const state = (await response.json()) as AppState;
    const req = state.requests.find((r) => r.shortId === shortId);
    if (req) {
      lastStatus = req.status;
      if (statuses.includes(req.status)) {
        return req;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${shortId} stuck in ${lastStatus}, wanted ${statuses.join('|')}`);
}

/**
 * Get the latest request short ID from the app state
 */
export async function latestShortId(request: APIRequestContext): Promise<string> {
  const response = await request.get('/api/state');
  const state = (await response.json()) as AppState;
  if (state.requests.length === 0) {
    throw new Error('No requests in state');
  }
  return state.requests[state.requests.length - 1].shortId;
}

/**
 * Send a sample receipt by uploading a file via the hidden file input
 */
export async function sendSampleReceipt(page: Page, file: string): Promise<void> {
  const fileInput = page.locator('#officer-file');
  await fileInput.setInputFiles(`fixtures/receipts/${file}`);
  // Press Enter in the message input to send
  const input = page.locator('input[aria-label="Message to Fronted"]');
  await input.press('Enter');
  // Wait for the message to be sent and processed
  await page.waitForTimeout(2000);
}
