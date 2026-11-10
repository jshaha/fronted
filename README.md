# Fronted

> …so nobody has to front it.

Fronted automates the financial reimbursement and virtual card workflow for student organizations at UC Berkeley. Officers ask the agent about spending before buying; code checks hard rules, Claude offers cited advice, the treasurer approves once, and a browser agent files the expense report in the university portal—no hands-on form filling.

**Pitch line:** "Ramp enforces the policy you wrote down. Fronted applies the policy your treasurer actually uses, then files it where the university requires."

## Stated Assumption

ASUC (UC Berkeley student government) holds every org's money. **Assumption, stated openly:** ASUC funds a Ramp-style virtual card program per org. The ASUC portal stays the university's official record and has no API. Since card platforms sync to ERPs through APIs, and this record has none, the agent becomes the sync—filing every card purchase as an expense report. A second assumption: ASUC requires an expense report per purchase (business purpose, attendees, itemized receipt).

The reimbursement branch (officer already paid from personal funds) needs no assumption: it works the way ASUC works today. *"Works today as reimbursements; if ASUC funds cards, nobody fronts money."*

## Quick Start

- **Node 22** required; `npm install`
- `npx playwright install chromium` (for the portal worker)
- `npm run demo` — runs reset, seeding, app on port 3000, and portal worker in replay mode (offline), then opens http://localhost:3000/simulator
- `npm run demo -- --prod` for a production server
- `PORTAL_RUNNER=headed npm run demo` files with a real, visible Chromium window instead of the in-app portal

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run demo` | Reset, seed, run app + worker in replay mode, open simulator |
| `npm run reset` | Wipe and recreate the SQLite database |
| `npm run worker` | Start portal-worker.ts (separate Node process) |
| `npm run record` | Replace hand-authored replay fixtures with real recordings (requires ANTHROPIC_API_KEY) |
| `npm test` | Run Vitest unit tests |
| `npm run e2e` | Playwright end-to-end tests in replay mode (port 3100, headless) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Build for production |
| `npm run receipts` | Regenerate receipt fixture PNGs (warns: changes receipt sha256 keys) |
| `npx tsx scripts/author-replays.ts` | Rewrite hand-authored replay recordings; add `--check` to validate |

## Environment Variables

| Variable | Meaning |
| --- | --- |
| `CLAUDE_MODE` | `replay` (default, offline) or `live` (calls Anthropic API) |
| `ANTHROPIC_API_KEY` | Required only for `CLAUDE_MODE=live` and `npm run record` |
| `CLAUDE_MODEL_*` | Model overrides per site (extractor, receipt, advisor, planner); default `claude-sonnet-5-5` |
| `REPLAY_LATENCY_MS` | Artificial delay for replayed calls; default 450 |
| `PORTAL_RUNNER` | `simulated` (default: in-app portal, no browser), `headed` (visible Chromium) or `headless` |
| `PORTAL_URL` | Where the worker files reports; default `http://localhost:3000/mock-portal` |
| `PORTAL_ALLOWED_ORIGINS` | Allowlist for portal navigation; default `http://localhost:3000,http://127.0.0.1:3000` |
| `PORTAL_STEP_DELAY_MS` | Slow down browser steps so humans can follow; default 350 |
| `ISSUER` | Card adapter; only `mock` exists |
| `CARD_BUFFER_PCT` | Buffer above card limit; default 20 |
| `RECEIPT_TOLERANCE_CENTS` | Reconciliation tolerance; default 50 |
| `DB_PATH` | SQLite file; default `data/fronted.sqlite` |

## Architecture

```
officer message ──► Extractor (Claude) ──► echo-back ──► RuleEngine Tier A/B
                                                            │ fail → rejected
                                                            ▼ pass
                                         budget_stats (code) ──► Advisor (Claude, Tier C)
                                                            ▼
                                   treasurer approval card ──► CardIssuer.createCard
                                                            ▼
                          "Simulate purchase" ──► transaction.settled ──► receipt photo
                                                            ▼
                     Receipt vision (Claude) ──► code reconcile ──► portal_filings job
                                                            ▼
                     portal worker (separate Node, Playwright) ──► Planner (Claude)
                                                            ▼
                     PlanValidator (code) ──► execute ──► confirmation ID ──► filed
```

**Code vs. Claude split:** Claude reads fields from messages and images; code verifies, parses, and decides. Every amount is computed by code and passed as a citable `budget_stat` ID. Claude words the advice; code checks that citations exist. Plan steps are strict: fill/select/check/upload/click with role + accessible name and values from `FilingPayload` only—no free text, no navigation.

**Three tiers:**

| Tier | Rules | Decided by | Effect |
| --- | --- | --- | --- |
| A (school) | `ASUC-ALC` (no alcohol), `ASUC-REQ` (required fields), `ASUC-BAN` (banned categories) | Code | Reject |
| B (org sheet) | `H-REM` (remaining budget), `H-CAP` (per-attendee cap), `H-MAX` (per-purchase max) | Code | Reject or needs_info |
| C (org knowledge) | Soft criteria + precedent | Claude Advisor | Advice only, never blocks |

Playwright runs in a separate worker process polling a job row in SQLite—never in a route. Portal navigation is locked to an allowlist. Idempotency is enforced three ways: unique `idempotency_key` on filing jobs, the mock portal rejecting duplicate `external_ref`, and the worker skipping jobs that already have a `confirmation_id`. Money is stored as integer cents with a ledger tracking commit, release, card_settled, filed, and adjust entries.

## Org inputs

The Advisor also reads what the org is saying right now: Slack (`SL-`), email (`EM-`), calendar (`CAL-`) and meeting notes (`MIN-`). Code picks the items for each request with a fixed query (same event, same purpose tag, or same budget line, last 14 days, newest 6), and the Advisor cites them by ID like precedents. Code drops any reason that cites an ID that doesn't exist. Messages are context, never approval.

In this build every connector reads seeded items (`data/seed/signals.json`) through `src/lib/signals/sources.ts`. A live Slack or Gmail connector would write into the same `signals` table. The treasurer view lists the inputs and marks the ones cited in pending advice.

## Replays

Default mode: `CLAUDE_MODE=replay` (offline). Recordings live at `fixtures/replays/<site>/<fixtureKey>.v<schemaVersion>.json`, keyed by site + fixtureKey + schemaVersion (not a prompt hash). Sites and keys: `extractor` (message slug), `receipt` (image sha256 prefix), `advisor` (message slug + fingerprint of knowledge rows), `planner` (snapshot structure hash + payload shape).

Missing recordings in replay mode trigger a hard error and write a stub to `fixtures/replays/_missing/` for hand-authoring. Recordings shipped are hand-authored (marked `"source": "hand-authored"`) because no API key was available. `npm run record` replaces them with real ones when you have `ANTHROPIC_API_KEY`.

In replay mode, use the suggested prompts, sample receipts, and the "Use demo note" button in the simulator. Other inputs have no recording and will error.

## Demo Script (3 minutes)

1. **0:00–0:30 | Reject with a fix.** Officer: "Can I spend $120 on stickers for Calapalooza tabling?" *Tier B checks: Marketing has $85.50 left (sheet row 4). The app rejects and suggests a fix.* See the Check panel citing `H-REM`.

2. **0:30–1:00 | Pass with caution from precedent.** Officer: "Can I spend $50 on pizza for Thursday's GM?" *Echo-back shows the parsed fields. All hard rules pass. Advisor runs: $4.17/head vs. last 5 GMs' $2.90 average (P-14, P-19); C-03 suggests $36. Advice is caution.* Treasure sees the Advice panel with reasons, each citing a past decision.

3. **1:00–1:30 | Treasurer approves with a note.** *Treasurer taps Approve and writes "Thursday is our recruiting GM, and walk-ins usually beat RSVPs. Recruiting GMs can go up to about $4.50 a head."* The note becomes P-31.

4. **1:30–1:50 | Card issued.** *Last 4, limit $60.00 (+20% buffer), food categories, expiry 2 days after the event.* The officer sees the card detail.

5. **1:50–2:10 | Simulate purchase.** *Officer taps "Simulate purchase" → $48.73 charged to Telegraph Slice Co. The receipt photo upload prompts appear.* The app sends a normalized `transaction.settled` event.

6. **2:10–2:30 | Receipt read and reconciled.** *Officer uploads pizza receipt. Claude reads items and amounts; code checks alcohol (none), reconciles within $0.50, and queues the filing job.* The portal form appears in the officer chat and fills in field by field as the agent works: it hits a date-format validation error, fixes it, resubmits, and gets a confirmation ID. *The budget panel updates; the request moves to filed.*

7. **2:30–2:50 | Learning loop.** Officer: "Can I spend $60 on pizza for next Thursday's recruiting GM?" *Echo-back passes. Advisor now supports (no caution), citing P-31.* This shows the org's own judgment carries forward.

8. **2:50–3:00 | (Optional) Reimbursement or beer.** *Reimbursement: same pipeline, personal-funds payee section in portal.* *Beer receipt: whole request cancelled; card terminated; $59.52 shown unreconciled on the dashboard for the treasurer to resolve.*

Talk track: Use five nouns: officer, treasurer, card, agent, ASUC portal. Use two fixed words: a "check" comes from code, can block, cites a rule; "advice" comes from Claude, never blocks, cites sources.

## Q&A Cheat Sheet

**Why file in the portal at all if ASUC funds the card?** The portal is the university's official record, the way an ERP is for a company. Card platforms sync to ERPs through APIs. This record has no API, so the agent is the sync. ASUC still requires an expense report with business purpose, attendees, and itemized receipt.

**Isn't this just Ramp's policy agent?** Ramp enforces policy you write down. Fronted applies the policy your treasurer actually uses—every reason cites an ID code verifies: budget sheet row, criterion ID, or past decision. The learning loop (treasurer notes become precedent) is the main differentiator.

**What if Claude invents an amount?** It never writes values. Amounts are parsed by code from verbatim message text. Advice numbers are `[[S-…]]` placeholder references filled by code; raw `$` amounts are dropped. The browser plan can only reference `FilingPayload` fields by name; the validator rejects free values and navigation.

**What if Claude invents a citation?** Dropped. Code verifies every ID exists in the database. If nothing survives, advice becomes unavailable ("no recommendation").

**Is the card real?** Mock issuer behind a `CardIssuer` interface. Field names are modeled on a typical card-issuing API, not claimed Ramp-compatible.

**What about beer on the card?** Whole request cancelled on both the card and reimbursement paths. The card is terminated; the charge stays unreconciled on the dashboard for the treasurer to resolve. Lines are never dropped—only the entire request is cancelled.

**Can it double-file?** No. Three idempotency layers: unique `portal_filings.idempotency_key`, the mock portal rejecting duplicate `external_ref`, and the worker skipping jobs that already have a `confirmation_id`.

**What if the portal changes?** The agent re-plans from a fresh snapshot. A scripted fallback plan runs if planning fails. We don't claim it works with any portal.

**Does it work offline?** Yes, in replay mode. All demo calls have hand-authored recordings.

## Testing

`npm test` (Vitest):
- Ledger budget math (commit, release, spent, remaining).
- Treasurer-only approval (server-side check).
- Tier A and B rule cases (remaining budget, per-attendee cap, per-purchase max, required fields).
- Hard-rule failure never calls the Advisor.
- Reasons with nonexistent citations are dropped.
- Filing idempotency (same expense cannot be filed twice).
- Portal URL allowlist enforcement.
- `transition()` state machine table.
- Plan validator rejects free values, navigation, and ambiguous targets.
- Alcohol cancels on both card and reimbursement paths.

`npm run e2e` (Playwright, replay mode, headless, port 3100):
- Happy path end to end (request → approval → card → purchase → receipt → filing → closed).
- Beer cancellation (request → cancelled, unreconciled charge).
- Reimbursement branch (receipt_received entry point).
- Learning loop (treasurer note changes next advice).

## Known Limitations & Deferred

- Replays are hand-authored until `npm run record` is run with an API key; demo inputs must match recordings in replay mode.
- Mock portal and ASUC policy text are fictional; no auth beyond the simulator's actor switch.
- Live Google Sheets sync and the live sheet-cell-edit beat (deferred, stretch).
- Second portal layout `?v=2` (deferred, stretch).
- Real card issuer adapter, SMS, Stripe, Ramp API, multiple orgs, RAG, CSV export, nudge emails, receipt eval, HEIC support, auth.

## Project Layout

```
src/
  app/              Next.js app routes (simulator, mock portal, API endpoints)
  lib/
    claude/         Claude wrapper, extractor, receipt vision, planner
    rules/          Tier A & B rule engine
    advisor/        Claude Advisor, citation check, budget stats
    state/          State machine, transitions, effects
    card/           CardIssuer interface, mock implementation
    portal/         PortalFiler, snapshot, plan validator, executor, allowlist
    pipeline/       Orchestrator (runs effects)
    db/             SQLite schema, seed, client
  components/       React UI (simulator panes, approval card, side panel)
worker/             portal-worker.ts (separate Node process)
scripts/            reset, demo, record, gen-receipts, author-replays
data/
  seed/             budget.csv, org knowledge SQL
  fronted.sqlite    SQLite database (created by `npm run reset`)
fixtures/
  receipts/         Receipt fixture PNGs
  replays/          Hand-authored and recorded Claude call fixtures
tests/              Vitest unit tests
e2e/                Playwright end-to-end tests
