# Changelog

Dated log of changes to the pipeline code, skills, and routines. Newest first.

Format: one entry per change. Say what broke or what changed, what the fix was, and how it was verified.

## 2026-08-27

### Fixed: Apollo sequence builds dead-ended on an expired Playwright session

**What happened.** Building the four ShiftUp sequences took a full session instead of one
pass. `ydc-apollo-build` documented only the Playwright path and only the case of a *missing*
profile, not an *expired* one. The profile's Apollo session had been dead since 25 June.
`build-sequences.js` waited 60 seconds for a manual login, then printed "Apollo login
confirmed" without re-checking, and failed all four sequence creations against a login page.
Two runs produced nothing.

The working path already existed and was recorded nowhere: Liftoff (2026-07-01) and Sap
Concur (2026-06-25) were both built over REST, with `build_method: apollo_rest_fallback
(playwright profile logged out)` sitting in territory-progress.json as a data field rather
than an instruction.

**Root cause.** Procedure gaps, plus one recurring code defect shape: a check that reports
success it never verified. That shape appeared three times in one file. The reply-type
dropdown warned and continued, which is the origin of the blank-subject/new-thread bug
Andrew originally reported. The login gate slept and then claimed confirmation. And the first
version of the new REST script tolerated a failed touch delete, which recreated the same
blank-subject bug by a different route.

**Fix.**

- `build-sequences.js`: reply-type selection now retries across four dropdown selectors and
  three option selectors, then reads the control back; only a verified read counts. On genuine
  failure it falls back to a new thread with a `Re: {touch 1 subject}` subject, records it, and
  the run summary lists every fallback. Previously a failed click produced a new thread with a
  blank subject and said nothing.
- `build-sequences.js`: added `normalizeSequences`, accepting both content shapes
  (`steps`/`type` and `touches`/`step_type`) and throwing at load with the offending sequence
  and touch named. Three of four content files in the repo used the second shape and would
  throw on every step, saving a sequence with zero steps.
- `build-sequences.js`: login gate now polls every 5s up to `LOGIN_WAIT_MS` (default 10 min),
  re-verifies, and exits non-zero with "Nothing was built" rather than false-confirming.
- New `apollo-sequence-builder/rest_build.py`: the documented REST fallback. Creates the
  campaign inactive, transfers ownership, adds seven steps, fills templates, converts touches
  3 and 6 to `reply_to_thread`, and verifies the result by reading Apollo back.
- `ydc-apollo-build`: added A.0 path selection, the full REST call sequence, a Definition of
  Done, Apollo-based verification replacing `_results.json`, a read-back guardrail, credit
  surfacing, and a pre-enrollment membership check.
- `ydc-ctd-warmintro`: corrected the step-creation example. It showed a nested
  `emailer_template` on the step POST as though the content sticks; Apollo ignores it and
  creates an empty template. That example would have produced empty sequences for anyone
  copying it.
- `ydc-outreach`: added a rule-precedence header, retired the connect-note close that
  contradicted CLAUDE.md, added the T7 structural constraint and placeholder hard gate, fixed
  the T7 research query, and added Gate 0 (count targetable contacts before writing copy).
- `CLAUDE.md`: added project-level rule precedence and resolved the cadence table to what
  actually ships.
- Precedence header added to ydc-research, ydc-account-plan, ydc-prospects, ydc-pipeline,
  ydc-territory-pipeline, ydc-usage-outreach.

**Apollo API behaviour, verified by probing on 2026-08-26.** A nested `emailer_template` on
`POST /emailer_steps` is ignored and an empty template is created; content needs
`PUT /emailer_templates/{id}`. `PUT /emailer_touches/{id}` is broken and returns
`undefined method '[]' for nil`. `type_of_email`, `touch_type` and a nested `emailer_touch` on
the step POST are all silently ignored. A reply step therefore requires
`POST /emailer_touches` with `type: reply_to_thread` plus a verified DELETE of the auto
`new_thread` touch. Waits of `0,1,3,3,3,3,3` reproduce the canonical cadence.

**Verified.** Four ShiftUp sequences built over REST and read back from Apollo: all inactive,
all owned by Andrew on both `user_id` and `object_owner_id`, 7 steps each, exactly one touch
per email step, `reply_to_thread` on positions 3 and 6, no empty bodies. Eight contacts
enrolled across the four and confirmed `paused`, sequences still inactive. The copy passed a
scripted self-review gate (word counts 82-95, one question per email, no em dashes, no banned
vocabulary, Socher and a public proof point in every sequence). `node --check` passes on
build-sequences.js; the normalizer was smoke-tested against all four repo content files.

### Settled: LinkedIn connect-note close is now a ranked menu, not one formula

Andrew's call. "Curious how..." became the de facto default by accident and should not be the
only or top option. CLAUDE.md now carries a five-option close menu, best first: direct
question about their approach, either/or that narrows the problem, routing/ownership question,
no question at all (state the consequence and stop), and "Curious how..." last. Added a rule
to vary the close across a batch, with at most one "Curious..." per account. The older
ydc-outreach close (", would love to connect and share more of my research.") is retired
outright, since the note never asks for the connection.

Also fixed the live copy this exposed: all four ShiftUp connect notes had closed with
"Curious...", which is the monotony the rule exists to prevent. Rewritten one shape each
(direct / no question / routing / either-or), pushed to the four Apollo sequences via
PUT /emailer_templates, and read back to confirm. Zero "Curious" remaining on the account,
all four under 250 characters.

**Still open.** Two `[T7 PLACEHOLDER]` DMs on ShiftUp Seq C and Seq D. Seq D has no real
persona at 29 employees.

## 2026-07-30

### Fixed: LinkedIn DMs were being sent to the wrong person

**What happened.** In the 2 PM watchdog run on 2026-07-28, 9 of 12 Touch-7 LinkedIn DMs
were typed into the wrong person's chat window. Jordan Soldo's thread received messages
written for Jordan, Ali, Sai and Antoine. Josh Lucas's thread received messages written
for Josh, Vijay, Vivek and Tridivesh. Jordan replied asking us to fix the automated
outreach. Every task was still marked complete in Apollo, so the 9 real recipients never
got their message and nothing retried.

**Root cause.** LinkedIn's chat overlay survives page navigation. `closeMessageOverlays()`
was supposed to close it between contacts but could not reach the close button inside
LinkedIn's `#interop-outlet` shadow DOM. It swallowed the failure and continued. The send
function then picked the compose box and Send button with page-wide `.first()`, which
resolved to the oldest open chat, so every message after the first landed in the first
recipient's thread. The send also logged success unconditionally, which is why the tasks
closed clean.

**Fix.** Four guardrails in `apollo-linkedin-connect.js`, all failing closed:

1. `sendDirectMessage()` now takes the contact, so it knows who it is writing to.
2. It refuses to send unless exactly one conversation is open and that conversation's
   recipient name matches the task's contact.
3. `closeMessageOverlays()` pierces shadow DOM, escalates through click, Escape and reload,
   verifies the overlay count reaches zero, and returns a real pass or fail.
4. A run ledger aborts the whole run if one thread is about to receive a second contact's
   message.

Send confirmation is now honest. A task is only marked complete after the compose box
clears or the message is found in the thread. Blocked sends are reported in the run summary
under their own heading and left queued for retry.

**Verified.** 16 name-match cases pass, covering every real cross-send from 2026-07-28
(all blocked) and legitimate sends including a partial-name case (all allowed). 11 browser
checks pass against a synthetic page that reproduces LinkedIn's shadow-DOM overlay
structure, including the two-overlays-open condition that caused the incident and a
fail-closed check where the overlay refuses to close.

Also dry-run against the live queue: all 21 pending DM tasks, real Apollo fetch, real
LinkedIn page loads, no actions and no completions. Zero crashes, zero errors. The new
shadow-DOM overlay scan ran between every contact against live LinkedIn markup and
correctly reported no open conversations every time, with no escalation to reload. Queue
breakdown: 7 eligible to send, 7 blocked on unaccepted connects, 7 blocked on unfilled
placeholder copy.

**Live test, one contact, and what it found.** Ran a supervised live send against one
never-messaged contact (Laith Al-Saadoon at Amazon, connected, copy verified clean). The
guardrails behaved exactly as designed: the run refused to send, typed nothing, and left the
Apollo task `scheduled` rather than marking it complete. Verified in Apollo afterward.

The reason it refused is a second, separate problem. A read-only DOM probe of current
LinkedIn markup shows the DM send path is broken regardless of the cross-delivery fix:

- Clicking the profile Message link no longer opens a conversation overlay. Afterward there
  are zero compose boxes, only the collapsed messaging bubble, and the URL is unchanged.
- The "Close your conversation with [Name]" label this fix relied on no longer exists.
- The new overlay chrome uses obfuscated hashed class names, so `msg-form__contenteditable`
  and `msg-form__send-button` are gone too.
- Navigating straight to `/messaging/thread/new/?recipient=` or `/messaging/compose/?recipient=`
  lands on the inbox without loading the recipient.

So no DM can currently send. The guardrails turn that into a loud refusal with the task left
queued, which is the correct failure mode, but it is not a working sender.

**This is the third instance of this bug class in about two months** (2026-05-28 overlay
persistence concatenating DMs, 2026-07-28 cross-delivery, 2026-07-30 overlay will not open).
Each recurrence traces to LinkedIn changing markup. Note that `salesforge-linkedin-migration`
already selected Salesforge for exactly this reason and sits pre-implementation. Decide
migrate versus rebuild before writing new selectors. The messaging inbox still uses stable
semantic class names, so an inbox-based open-and-verify flow is the viable Playwright path if
we stay on DOM automation.

Connect (Touch 2) and post-like (Touch 5) paths were not verified live. State detection works;
the click paths were not exercised.

### Added: controlled-testing limits

`TASK_LIMIT` caps how many tasks a run processes. `ONLY_TYPE` restricts a run to one Apollo
task type. Both default to unrestricted and both log what they dropped, so a capped run
never reads as full coverage. Added for supervised verification runs.

### Changed: scheduled LinkedIn senders disabled

`ydc-linkedin-apollo-tasks-daily` (9 AM sender) and `linkedin-tasks-check` (2 PM watchdog
re-run) are both disabled. They stay off until the live markup check passes.
`ydc-linkedin-queue` (9:33 AM) is left on because it only reports and sends nothing.

### Added: version control for the LinkedIn task script

`apollo-linkedin-connect.js` had no version control. It now lives in
`apollo-linkedin-connect/` in this repo, with a `.gitignore` covering the auth tokens,
per-prospect DM copy, and research output that must never be committed.
