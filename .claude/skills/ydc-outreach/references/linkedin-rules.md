# LinkedIn Connect Rules (Touch 2)

**Policy (Andrew, 2026-10-08): LinkedIn connection requests never carry a note.**

- Do not write, draft, review, QA or store connect-note copy.
- The Apollo `linkedin_connect` / `linkedin_step_connect` step is created with an empty body (`""`).
- `apollo-linkedin-connect.js` sends the request with no note. It ignores any connect template text.
- `connect-overrides.json` is retired.
- The email sequence carries the pitch. Touch 7 carries the personal note, as a manual DM task that
  Andrew reviews and sends by hand.

This supersedes every earlier connect-note rule: the Fact-to-Consequence formula, the Research-Share
close, the 2026-08-27 ranked close menu, the "Curious how..." guidance, and the 250-character limit.
The old formula is in git history if it is ever needed.

**Why:** on 2026-09-25 and 09-28 the LinkedIn script sent 18 Cohort 1A/1B connection requests with raw
`{{calls_30d}}` placeholders in the note. Apollo never renders variables in LinkedIn steps.
