# Fronted: spec

Fronted lets student org officers text an agent to (1) get a pre approved virtual card before they buy, or (2) get reimbursed after they buy. A treasurer approves everything. Build it as a hackathon MVP that runs locally and demos well.

## Stack
TypeScript everywhere. Next.js (app router) for the dashboard and API routes. SQLite with Drizzle for data. Vitest for unit tests. Playwright for end to end tests. Anthropic SDK (claude-sonnet-4-6 model) for the agent and receipt vision. Stripe Issuing (test mode) for virtual cards. Twilio for SMS.

## Architecture rule
The agent core must not know about SMS. Put messaging behind a `Channel` interface with two adapters:
1. `TwilioChannel` (real SMS via webhook)
2. `SimulatorChannel` (a chat page at /simulator where I can play officer and treasurer side by side)
All tests and the demo must work with the simulator alone. Every external service (Anthropic, Stripe, Twilio) sits behind an interface with a mock, and `MOCK_MODE=1` uses mocks for everything.

## Data model
orgs, members (name, phone, role: officer | treasurer), budget_lines (name, allocated, spent), policies (per line rules, e.g. food max per attendee, no alcohol, itemized receipt required), requests (type: pre_approval | reimbursement, status, amount, line, purpose), receipts (image path, extracted JSON, confidence), cards (stripe card id, limit, merchant category lock, expires_at), audit_log.

Seed one org, "Neurotech@Berkeley", with lines: Food & Events $1200, Project Hardware $2500, Marketing $300, and a treasurer and two officers.

## Flow 1: pre approval (most important)
1. Officer: "Can I spend $80 on pizza for Thursday's GM?"
2. Agent parses amount, purpose, date; picks a budget line; checks remaining budget and policies.
3. If it fails a check, agent explains why and suggests a fix.
4. If it passes, agent messages the treasurer: summary plus "Reply Y to approve, N to deny".
5. On Y: create a Stripe Issuing virtual card (test mode) with a spending limit equal to the amount, allowed merchant categories matching the line (e.g. restaurants for food), and an expiry 2 days after the event. Reply to the officer with the last 4 digits and expiry. Never print a full card number.
6. Stripe `issuing_authorization` / `issuing_transaction` webhooks update spent amounts and trigger a message to the officer asking for the receipt.
7. The receipt photo closes the request.

## Flow 2: reimbursement
1. Officer sends a receipt photo.
2. Vision extraction returns structured JSON: vendor, date, subtotal, tax, total, line items, confidence.
3. Agent maps items to budget lines and flags problems: not itemized, over limit, tax not reimbursable, duplicate receipt, low confidence (ask the officer to confirm the total).
4. Treasurer approves with Y.
5. A Playwright agent fills and submits a MOCK reimbursement portal that you build at /mock-portal (form with org, payee, amount, line, description, receipt upload). Never target a real school site.
6. Status moves to submitted. A "follow up" job drafts a nudge email after N days (draft only, saved to the DB, never sent).

## Flow 3: treasurer dashboard (/dashboard)
Budget lines with allocated, spent, pending, remaining. Open requests with age. Live card list. Audit log. CSV export.

## Safety
Refuse to start if any Stripe key starts with `sk_live` or `rk_live`. Only the treasurer's phone can approve. Approvals expire after 24 hours. Log every agent tool call to audit_log.

## Tests that must exist and pass
Unit (Vitest): budget math, policy checks, request parsing, receipt JSON validation, the live key guard, approval only from the treasurer.
Receipt eval: put 6 receipt images in fixtures/receipts (generate synthetic ones with expected JSON if I have not added real ones). A script `npm run eval:receipts` reports how many totals match exactly; target 5 of 6. In MOCK_MODE it uses recorded responses.
E2E (Playwright, MOCK_MODE=1): full Flow 1 in the simulator through card creation and webhook receipt request; full Flow 2 through mock portal submission; dashboard numbers match the DB after both flows.

## Deliverables
README with setup, env vars, how to run the demo, and a 3 minute demo script. `.env.example`. `npm run demo` starts the app with seeded data in mock mode.
