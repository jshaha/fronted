# Fronted

* **Author:** jshaha
* **Date:** 2026-11-08
* **Status:** Brainstorm, round 2 (revised after the funding decision)

## Overview

Fronted is a solo entry for the BBS x Ramp Hackathon. The prompt is "Automate an outdated financial workflow using the newest AI tools." The build is due Tuesday, 2026-11-10, about 48 hours from now, and there is no code yet.

**How it works today.** At UC Berkeley, ASUC (the student government) holds every student org's money. The money leaves ASUC only as a reimbursement:

1. An officer of Neurotech@Berkeley pays a vendor with their own money.
2. The officer fills out a long ASUC form.
3. The org treasurer checks the form by hand.
4. ASUC pays the officer back from the org's account.

Officers also don't know ahead of time whether the org will approve a purchase. The org decides from its own budget and spending habits, not only from school rules.

**Stated assumption (said out loud in the pitch):** ASUC funds a Ramp-style virtual card program for each org. The ASUC portal stays the university's official record and has no API.

**The flow:**

1. The officer asks the agent before buying: "Can I spend $50 on pizza for Thursday's GM?" (GM = general meeting)
2. Code checks the request against the org's budget sheet and hard rules, plus a few school rules.
3. Claude gives *advice* on the org's softer criteria. Each reason it gives cites the org's own past decisions.
4. The treasurer approves once.
5. A mock virtual card with a capped limit is issued.
6. After the purchase, Claude reads the receipt photo and code checks it.
7. A browser agent files the expense report in a mock ASUC portal.

The same pipeline handles an officer who already paid. It files a reimbursement instead, and that works today with no assumption.

**Pitch line:** "Ramp enforces the policy you wrote down. Fronted applies the policy your treasurer actually uses, then files it where the university requires."

## Analysis

All seven Goldfish reviewers finished round 2: design, codebase details, zoom-out, comprehension, implementation readiness, structure, and inventive catalyst. Claims about Ramp, Stripe, Anthropic, Google, or Playwright features marked **[unverified]** come from reviewer memory and have not been checked against live docs.

### Blockers

1. **The org-knowledge layer can look like Ramp's own policy agent** (all 7 reviewers). Ramp is believed to have an AI agent that checks spending against an uploaded policy [unverified]. If "org criteria" means Claude reading a policy document, judges will see their own product. What Ramp doesn't hold is this org's data:
   - the treasurer's budget sheet and semester plan;
   - **precedent**: past spending, and the treasurer's decisions with reasons;
   - unwritten norms, which get written down when the treasurer states them.

   Every piece of advice must cite one of these by ID, and code checks that the ID exists. The demo needs one moment where a request passes every hard rule but gets flagged from precedent. For example: "$50 for 12 RSVPs = $4.17 per head. The last 5 GMs averaged $2.90 (P-14, P-19). 2 GMs left with $140 on the line (sheet row 4). Suggest $36."
2. **`SPEC` and the round 1 brief now contradict the product.** `SPEC` still describes:
   - texting the agent, Twilio, Stripe, and one `MOCK_MODE` switch;
   - a Flow 1 that ends at the receipt;
   - a portal form with a payee field;
   - the eval, CSV, and nudge-email work that was cut.

   Building from it brings back the cut work. Rewrite `SPEC` before writing code (30 to 60 minutes).
3. **Beer bought on the card is undecided.** On the card path, the receipt check runs after ASUC money is already spent. Dropping the beer line leaves the card charge and the filed amount out of balance. See Key Decisions, item 4.
4. **"If ASUC runs cards, why file in the portal at all?"** If this is left for Q&A, the browser agent looks like busywork. Put the answer on the assumption slide: "The portal is the university's official record, the way an ERP is for a company. Card platforms sync to ERPs through APIs. This record has no API, so the agent is the sync." A second assumption sits behind this: ASUC still requires an expense report for each purchase, with business purpose, attendees, and an itemized receipt.
5. **Both ends of the money path are assumptions**: the card program, and an expense-report form type in the portal. Only the reimbursement path matches how ASUC works today. The fix is to make the value independent of the assumption: "Works today as reimbursements; if ASUC funds cards, nobody fronts money." That means the reimbursement branch has to actually run, not just appear on a slide.

### Major risks

- **"Deterministic" rules run on inputs Claude extracted.** Amount, attendee count, budget line, and line items all come from the model. Mitigations:
  - Echo the extracted fields back to the officer: "I read: $50, Food & Events, Thu GM, 40 attendees."
  - Check that the amount appears word for word in the officer's message.
  - Validate every model output with zod. Retry once, then move the request to `needs_info`.
  - Never default to pass.
  - Flag alcohol if either a keyword list or Claude's per-item category tag fires.
- **Claude can invent citations.** Code drops any reason whose ID isn't in the database. If the output fails validation, show "no recommendation."
- **Scope is still tight.** The org-knowledge layer adds 4 to 7 hours (seed content, the advisor, the citation check, the treasurer's view). That time is paid for by dropping Stripe and the payee logic, and by shrinking the portal and dashboard.
- **Too many nouns for 3 minutes.** Say five: officer, treasurer, card, agent, ASUC portal. Use two fixed words:
  - a **check** comes from code, can block, and cites a rule;
  - **advice** comes from Claude, never blocks, and cites sources.

  Show them in two separate panels.
- **Latency and token use.** The happy path makes 4 to 7 Claude calls in a row. A raw page structure can be 10k to 30k+ tokens.
  - Trim the page to form controls only: label, role, name, required, options, error text. Aim for under 2k tokens.
  - Keep the org context as one fixed prompt prefix. Prompt caching may help [unverified].
  - Skip RAG: 20 to 50 precedent rows fit in the prompt.
- **Replay recordings can break silently.**
  - Key them by `site + fixtureKey + schemaVersion`, not by a hash of the prompt.
  - In replay mode, a missing recording is a hard error.
  - Add `npm run record` to re-record them.
- **The budget sheet's source of truth.** Live Google Sheets OAuth costs hours and can fail on stage.
  - Import a CSV once and validate it with zod.
  - After the import, SQLite is the authority.
  - Store `source_row` on each line so citations can point back to the sheet.
- **"Shaped like Ramp's API" invites "which endpoint?"** Spend at most 15 minutes checking one Ramp card endpoint in its public docs. If you can't check one, say "modeled on a typical card-issuing API." Never say "Ramp-compatible."
- **Tooling claims to check:**
  - sharp probably can't decode iPhone HEIC photos [unverified]. Use heic-convert, or JPEG/PNG only.
  - Playwright `locator.ariaSnapshot()` may have replaced `page.accessibility.snapshot()` [unverified].
  - Anthropic strict structured outputs may not be available on your model [unverified]. Validate with zod either way.

### Core trade-offs and how to resolve them

**C1. Org judgment vs. looking like Ramp's policy agent.** Split org knowledge into three sources that can be cited:

- the budget sheet;
- written criteria with IDs;
- precedent rows.

When the treasurer approves or denies with a note, the note becomes a new criterion or precedent row, and the next piece of advice cites it. This **learning loop** is cheap, about 20 lines to 1 hour of work, and it's the main differentiator.

Show the knowledge is live with one on-stage beat. Either edit a cell in the sheet so the same request flips from pass to over budget, or have the treasurer add a criterion so the advice changes. Record replays for both the before and the after.

**C2. Testable rules vs. nuance: three tiers.**

| Tier | Covers | Decided by | Effect |
| :--- | :----- | :--------- | :----- |
| A | School hard rules: alcohol, required fields, banned categories (2 to 3 rules, minor in the pitch) | Code | Blocks |
| B | Org hard rules from the sheet: remaining = allocated − spent − committed; cap per attendee; max per budget line; required fields per line | Code | Blocks, or sends to `needs_info` |
| C | Org soft criteria and precedent | Claude (the Advisor) | Advice only, never blocks |

How Tier C works:

- **Output shape:** `{verdict: support|caution|against|unavailable, reasons: [{text, cites: [{type: rule|past_spending|budget_stat, id}]}]}`.
- **Numbers:** code computes every number and passes them in as citable `budget_stat` objects. Claude only words them.
- **When it runs:** the Advisor runs only after Tiers A and B pass, and it never changes a request's state.
- **Edge cases:** anything code can't classify goes to the treasurer as "needs a decision."
- **Who sees it first:** the officer sees soft flags before the treasurer does.

Pitch line: "Claude reads, code decides."

**C3. A modern ASUC (it funds cards) vs. a legacy ASUC (its portal has no API).** Present this as a transition period. Use the ERP-sync answer, and keep reimbursement as the path that needs no assumption.

**C4. An agentic browser vs. the model inventing values.** Claude decides *where* each value goes, never *what* the value is.

- Each plan step is one of: fill, select, check, upload, or click.
- Each step aims at a target given as role plus accessible name.
- Each value must come from a `FilingPayload` field.
- Code rejects any free-text value, any navigation, and any script evaluation.
- Each target must match exactly one element.

This answers the judge question "what if it invents an amount?"

### Ideal Final Result

1. The officer asks one question and gets an answer that applies both rulebooks, the org's and the school's. It's grounded in the org's own sheet and past decisions, with a citation for every reason.
2. The treasurer taps once, and the card caps the spending. The same path runs today as a reimbursement.
3. A receipt photo is the only other input. The ASUC portal gets filed exactly once, and every dollar is in one known state: committed, spent on the card, filed, or unreconciled.
4. Every treasurer decision becomes precedent, so the org's judgment carries into the next request without anyone having to restate it.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  1. **One story, under 3 minutes:**
     - an org-rule rejection that cites a sheet row or criterion ID, with a suggested fix (not alcohol);
     - a passing request with advice that cites precedent;
     - the treasurer approves once;
     - a mock card: last 4 digits, the limit plus a buffer of about 20% (set in config), allowed categories, and an expiry the app enforces;
     - "Simulate purchase," sent as a normalized event through the same handler a real card adapter would use;
     - Claude vision reads the receipt, and code reconciles it;
     - the Claude-planned portal fill in a visible browser, fixing one validation error;
     - a confirmation ID, and the budget panel updates.
  2. **Seeded org knowledge:**
     - `budget.csv`;
     - 5 to 8 criteria, each with an ID and a source;
     - 15 to 50 past spending and decision rows, with treasurer notes;
     - optionally, events with RSVP counts.
  3. **The treasurer-note learning loop.**
  4. **One mock portal form** with a `payment_method` field (ASUC program card or personal funds; payee fields appear only for personal funds). It has one deliberate validation error and rejects a duplicate `external_ref` on the server.
  5. **Reimbursement as a data flag** (`funding_source`) on the same pipeline.
  6. **Two switches:** `CLAUDE_MODE=live|replay` and `PORTAL_RUNNER=headed|headless`. `ISSUER=mock` only, but keep the interface so a real issuer can be added later.
  7. **Tests:**
     - budget math from ledger rows;
     - treasurer-only approval, checked on the server;
     - Tier A and B rule cases;
     - a hard-rule failure never calls the Advisor;
     - a reason that cites a nonexistent ID is dropped;
     - filing idempotency (the same expense can't be filed twice);
     - the portal URL allowlist;
     - one happy-path run in replay mode.
  8. **Demo safety:**
     - receipt fixtures: clean pizza, pizza plus beer, and a reimbursement receipt;
     - a measured time-saved number, timed on the expense-report form;
     - a backup video by hour 42 to 44;
     - `npm run reset`;
     - a check that the demo runs offline.
* **Stretch (cut in this order):**
  1. a second portal layout;
  2. the live sheet-edit beat;
  3. the reimbursement beat on stage (build the data flag early regardless).
* **Out-of-Scope Non-Goals:**
  - any use of Stripe;
  - Ramp API access;
  - Twilio/SMS;
  - live Google Sheets OAuth or writing back to the sheet;
  - RAG or embeddings;
  - CSV export and nudge emails;
  - the 6-receipt eval;
  - more than one org;
  - any real Berkeley site;
  - claiming the agent "works with any portal";
  - a separate dashboard page (a side panel is enough);
  - making the alcohol rejection the headline moment.

## Alternatives Weighed

* **Stripe Issuing test mode as the card provider.** Rejected by author: with the ASUC-funded card program as a stated assumption, a mock behind a card-issuer interface is enough, and Stripe setup costs hours.
* **Dropping the card and pitching it as a next step.** Rejected by author in favor of keeping the card with the funding assumption stated openly.
* **Twilio/SMS in the 48-hour build.** Rejected by author and confirmed in review: it adds setup time without changing the demo, and US SMS registration (A2P 10DLC) takes days to weeks.
* **A single prose policy document as the org knowledge.** Rejected in review: it follows the same pattern as Ramp's policy agent [unverified], and its contents can't be cited.
* **Claude making block or approve decisions, or doing budget arithmetic.** Rejected in review: it can't be tested and it weakens the control story.
* **Advice without citations, or citations that code doesn't check.** Rejected in review: they read as hallucination.
* **Live Google Sheets API or two-way sync.** Rejected in review: hours of OAuth work and a point of failure on stage.
* **RAG or a vector database for precedent.** Rejected in review: the data fits in the prompt, so a fixed query (same line, same purpose tag, last N rows) is enough.
* **Separate portal forms or code paths for card and reimbursement.** Rejected in review: they duplicate work and drift apart.
* **Raw page structure in the prompt.** Rejected in review: too slow and too many tokens.
* **Plan steps with free-text values.** Rejected in review: they let the model invent amounts.
* **Fixed Playwright selectors presented as an agent, or full screenshot-based computer use.** Rejected in review. Fixed selectors undercut the novelty claim, and screenshot-based control is too slow and unreliable live.
* **Playwright inside a Next.js API route.** Rejected in review: run it as a separate worker that polls a job row.
* **Floating-point money.** Rejected in review: use integer cents.
* **Replay keyed by a prompt hash.** Rejected in review: it breaks silently.
* **The alcohol rejection as the headline.** Rejected by author ("more than the alcohol rules, it's whether your org itself says OK to spending that $50") and in review.
* **The live-key guard as the safety test.** Rejected in review: with no Stripe, it guards nothing. Use a portal URL allowlist instead.

## Key Decisions & Staging for Next Steps

**Decided:**

1. **Money model.** ASUC funds a card program for each org (a stated assumption). Card purchases are filed as expense reports. A reimbursement is the same pipeline with `funding_source=out_of_pocket`. The ERP-sync sentence answers "why the portal?"
2. **Approvals.** One treasurer approval covers both the card and the filing. The treasurer acts again only if the receipt is flagged or the amount goes over the buffer.
3. **Pipeline modules.**
   - **Extractor:** Claude, with schema-validated output.
   - **RuleEngine:** pure TypeScript; stops at the first failed rule.
   - **Advisor:** Claude; gives cited advice only.
   - **`transition(request, event) -> {status, effects}`:** a pure function; Claude never triggers a transition.
   - **PortalFiler:** takes a `FilingPayload` and a `PortalPlan`.
   - **CardIssuer:** `createCard`, `getCard`, and `terminateCard`, plus a normalized `transaction.settled` event.
4. **Request states:**
   - **Before approval:** `draft`, `needs_info`, `rejected`, `awaiting_approval`, `denied`, `expired`, `approved`.
   - **Card and receipt:** `card_issued`, `purchased`, `receipt_received`, `receipt_flagged`.
   - **Filing:** `filing_queued`, `filed`, `filing_failed`, `needs_human`, `closed`.

   A reimbursement enters at `receipt_received`.
5. **Data model.**
   - **People:** `orgs`; `members` (role, no phone numbers).
   - **Budget:** `budget_lines` (`allocated_cents`, `source_row`); `ledger_entries` (commit, release, card_settled, filed, adjust). Remaining budget is computed from the ledger.
   - **Rules and knowledge:**
     - `school_rules` (quoted word for word);
     - `org_hard_rules`;
     - `org_criteria` (with `source` and `last_confirmed_at`);
     - `precedents` (outcome plus treasurer note).
   - **Requests:** `requests`, `rule_results`, `recommendations`, `approvals`.
   - **Card:** `cards` (`issuer`, `external_card_id`, `last4`, `limit_cents`, `allowed_categories`, `expires_at`, `status`); `card_transactions` (unique external ID).
   - **Filing:** `receipts` (unique sha256 hash); `portal_filings` (`form_type`, unique `idempotency_key`, `plan_json`, `confirmation_id`, `status`).
   - **Logging:** `audit_log` (request ID, trace ID, model, latency, and browser steps).
6. **Reconciliation.** The filed amount is the card transaction amount. The receipt must match it within a set tolerance. "Unreconciled $" is money spent on the card that hasn't been filed yet.
7. **Idempotency in three places:** a unique key on the filing job, the mock portal rejecting duplicates, and the worker skipping any job that already has a confirmation ID.

**Still open, to settle before `/egm-draft`:**

1. ~~**Beer on the card.**~~ **Decided by author:** if the receipt shows alcohol, the whole request is cancelled and nothing is filed. This applies on both paths. On the card path, the card is terminated and the charge stays on the dashboard as unreconciled money owed back, for the treasurer to resolve. On the reimbursement path, the reimbursement is cancelled. Lines are never dropped.
2. **Which live beat proves the knowledge is the org's own:** editing a sheet cell, a treasurer note, or both.
3. **Product name.** Rename it, or keep "Fronted" with the tagline "…so nobody has to front it."
4. **Pick one example amount** ($50 or $80) for the seed data, fixtures, replays, and script.
5. **Tolerance for receipt reconciliation** ($0.01 to $0.50).
6. **Rewrite `SPEC`** with these sections:
   1. Stated assumption
   2. Pipeline and modules
   3. Org knowledge model
   4. Code vs. Claude split
   5. State machine
   6. Data model
   7. Interfaces and switches
   8. Demo script
   9. In scope (48h)
   10. Deferred
   11. Tests

**Suggested build order:**

| Hours | Work |
| :---- | :--- |
| 0–2 | Rewrite `SPEC`. Then: project setup, schema, CSV seed with zod, `npm run reset`, the replay wrapper for Claude calls. Confirm the model ID works on your key. |
| 2–4 | Write the seed content (sheet, criteria, precedents). Realistic content matters more than code here; use real Neurotech numbers if you can get them. |
| 4–9 | Mock portal: payment-method field, validation error, duplicate rejection. Playwright worker driven first by fixed data, then by Claude's plan with the payload-only value check. |
| 9–13 | Receipt vision with a fixed category list, alcohol check, reconciliation, recordings. |
| 13–17 | Request parsing with echo-back, `transition()`, Tiers A and B, ledger math, tests. |
| 17–21 | Advisor with citation check, `budget_stat`s, learning loop, recordings. |
| 21–26 | Mock card issuer, "Simulate purchase," simulator with officer and treasurer panes, side panel (budget, unreconciled $, agent trace). |
| 26–30 | End-to-end replay run, the `receipt_flagged` path, the reimbursement flag. |
| 30–34 | Stretch items, in the cut order. |
| 34–44 | Demo script, measured number, backup video, offline check. |
| 44–48 | Buffer. |

**Open questions for the author:**

1. Does the real ASUC/LEAD portal have an expense-report type? Can you get screenshots of the real form?
2. Can you get real Neurotech data: the budget sheet layout, past GM spending, attendee counts, and any criteria written in the bylaws or meeting minutes?
3. Will the reimbursement branch get its own beat on stage, or one sentence?
4. Will you check one Ramp card endpoint before claiming the interface is "Ramp-shaped"?
5. What are the judging criteria and the time limit?
6. What are the real baseline numbers: minutes per form, days until repayment, forms per semester, rejection rate?

**Claims not yet checked against live docs:**

- Ramp: its policy agent, ERP connectors, and API shape.
- Stripe: whether Issuing can set a custom card expiry.
- Anthropic: prompt caching and strict structured outputs on your model.
- Image handling: HEIC decoding in sharp.
- Playwright: the `ariaSnapshot` API.
- Google Sheets: whether a published CSV URL needs auth.
- Berkeley: P-card reconciliation practice, and whether the ASUC portal has an expense-report form type.
