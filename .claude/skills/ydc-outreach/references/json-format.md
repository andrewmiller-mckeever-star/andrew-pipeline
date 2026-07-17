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
          "connect_note": "Under 250 chars. Fact-to-Consequence + Curiosity Hook. Zero pitch, zero CTA.",
          "dm_message": "Under 300 chars. References their LinkedIn content. Zero product mention. Zero meeting CTA.",
          "touch1_hook": "One-line hook used in Touch 1 subject/opener",
          "touch1_hook_type": "trigger_event"
        }
      ]
    }
  ]
}
```

## Step Types (Apollo REST API)

| Type | Touch | Day | Notes |
|------|-------|-----|-------|
| `manual_email` | 1 | 0 | Andrew reviews and sends |
| `auto_email` | 3 | +4 | Reply thread, fires after Touch 1 sent |
| `action_item` | 5 | +6 | LinkedIn profile view task |
| `auto_email` | 6 | +3 | Breakup reply, fires after Touch 1 sent |

LinkedIn connect and LinkedIn DM are handled via the LinkedIn queue file in Drive — NOT sequence steps.

## Sequence Naming Convention

```
YDC | {Company} | Seq 1: Technical Evaluator
YDC | {Company} | Seq 2: Business Sponsor
```
Whale pipeline: Seq A: Engineering Leader / Seq B: Executive Sponsor / Seq C: Product Leader / Seq D: AI/ML Leader

## Writing Rules (all apply)

- Touch 1 subject: under 6 words
- Touch 1 body: 80-120 words, AIDA structure, opens with "Hi {{first_name}},"
- Follow-ups: 80-120 words, each adds NEW proof point or angle (never rephrase)
- No em dashes. Plain text only. 5th-7th grade reading level.
- Interest-based CTAs only (no time-based asks)
- Tentative language in Interest section
- At least one Socher reference per sequence
- At least one public proof point per sequence
- Never name competitors. Never reference specific evals.
- Strip corporate suffixes.
- connect_note: Fact-to-Consequence + Curiosity Hook, under 250 chars, zero pitch, zero CTA, zero flattery
- dm_message: peer-to-peer, references their actual LinkedIn posts/content, under 300 chars, zero product mention, zero meeting CTA, different hook from Touch 6

## touch1_hook_type Values

- `trigger_event` — recent news, launch, hire, funding, product announcement
- `their_content` — something they published, posted, or said publicly
- `company_initiative` — a named product, team, or strategic direction
- `role_pain` — fallback when nothing specific is findable (flag if 3+ contacts use this)
