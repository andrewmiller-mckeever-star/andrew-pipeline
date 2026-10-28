# Apollo Sequence JSON Format

Sequences are built via Apollo REST API (cloud-native). No local JSON file is written or passed to Playwright. Hold the structure below in memory and pass it to ydc-apollo-build Phase A.

## In-Memory Schema

```json
{
  "account": "Company Name",
  "domain": "company.com",
  "sequences": [
    {
      "name": "YDC | Company | Seq 1: Technical Evaluator",
      "steps": [
        {
          "type": "manual_email",
          "subject": "Subject line under 6 words",
          "body": "Hi {{first_name}},\n\nFirst paragraph (Attention — hook).\n\nSecond paragraph (Interest + proof point).\n\nThird paragraph (Desire — tentative CTA).\n\nThanks,\nAndrew\nYou.com"
        },
        {
          "type": "auto_email",
          "body": "Hi {{first_name}},\n\nNew proof point or angle (not a rephrase of Touch 1).\n\nAndrew"
        },
        {
          "type": "action_item",
          "task_note": "View {{first_name}} {{last_name}}'s LinkedIn profile. Like or comment on a recent post if one exists in the last 2 weeks. Note any post topics or career updates for LinkedIn DM."
        },
        {
          "type": "auto_email",
          "body": "Hi {{first_name}},\n\nBreakup touch — new angle, not a rephrase. AIDA structure.\n\nAndrew"
        }
      ],
      "contacts": [
        {
          "first_name": "Sarah",
          "last_name": "Chen",
          "email": "sarah@company.com",
          "title": "VP Engineering",
          "linkedin_url": "https://linkedin.com/in/sarahchen",
          "warm_intro": false,
          "connect_note": "",
          "dm_message": "Under 300 chars. References their LinkedIn content. Zero product mention. Zero meeting CTA. Manual task, Andrew sends it by hand.",
          "touch1_hook": "One-line hook used in Touch 1 subject/opener",
          "touch1_hook_type": "trigger_event"
        }
      ]
    }
  ]
}
```

## Step Types (Apollo REST API)

The schema example above is an older, shorter shape. The step order and types that ship are the
12-touch cadence in SKILL.md (Content JSON format), with
`"waits": [0,1,2,3,2,3,3,4,3,4,5,7]` and `"wait_mode": "day"` on each sequence (default since
2026-10-27). Touches 1 and 8 are new threads with subjects. Touches 3 and 6 reply to thread A.
Touches 10 and 12 reply to thread B.

LinkedIn connect (T2) and LinkedIn DM (T7) are Apollo sequence steps (see SKILL.md Build Method). The Drive queue file is retired.
- `connect_note` is always an empty string. Connection requests carry no note (policy 2026-10-08).
- `dm_message` is drafted copy for a manual task. Andrew reviews and sends every LinkedIn message by hand. No script sends it.

## Sequence Naming Convention

```
YDC | {Company} | Seq 1: Technical Evaluator
YDC | {Company} | Seq 2: Business Sponsor
```
Whale pipeline: Seq A: Engineering Leader / Seq B: Executive Sponsor / Seq C: Product Leader / Seq D: AI/ML Leader

## Writing Rules (all apply)

- Touch 1 and Touch 8 subjects: under 6 words
- Touch 1 body: 50-90 words, AIDA structure, opens with "Hi {{first_name}},"
- Follow-ups: 80-120 words, each adds NEW proof point or angle (never rephrase). Touch 12 breakup: two sentences
- No em dashes. Plain text only. 5th-7th grade reading level.
- Interest-based CTAs only (no time-based asks), except the Touch 10 meeting ask
- Tentative language in Interest section
- At least one Socher reference per sequence
- At least one public proof point per sequence
- Never name competitors. Never reference specific evals.
- Strip corporate suffixes.
- connect_note: always "". No connect-note copy is written (2026-10-08)
- dm_message: peer-to-peer, references their actual LinkedIn posts/content, under 300 chars, zero product mention, zero meeting CTA, different hook from Touch 6. Sent by hand from Andrew's Apollo task queue

## touch1_hook_type Values

- `trigger_event` — recent news, launch, hire, funding, product announcement
- `their_content` — something they published, posted, or said publicly
- `company_initiative` — a named product, team, or strategic direction
- `role_pain` — fallback when nothing specific is findable (flag if 3+ contacts use this)
