# Apollo Sequence JSON Format

## JSON Data Format

Write the completed sequence JSON to:
`~/Desktop/YDC Pipeline/apollo-sequence-builder/{account}_sequences.json`

```json
{
  "account": "Company Name",
  "domain": "company.com",
  "sequences": [
    {
      "name": "YDC | Company | Seq A: Engineering Leader",
      "steps": [
        {
          "type": "automatic_email",
          "email_type": "new_thread",
          "subject": "Subject line here",
          "body": "Hi {{first_name}},\n\nFirst paragraph.\n\nSecond paragraph.\n\n{AE_NAME}\nYou.com"
        },
        {
          "type": "linkedin_connect",
          "message": "LinkedIn connect note under 250 chars."
        },
        {
          "type": "automatic_email",
          "email_type": "reply",
          "body": "Hi {{first_name}},\n\nFollow-up paragraph.\n\n{AE_FIRST_NAME}"
        },
        {
          "type": "phone_call",
          "task_note": "Call script text goes here."
        },
        {
          "type": "action_item",
          "task_note": "Manual task note (e.g., engage on LinkedIn / research before the breakup email)."
        },
        {
          "type": "automatic_email",
          "email_type": "reply",
          "body": "Hi {{first_name}},\n\nBreakup paragraph.\n\n{AE_FIRST_NAME}"
        },
        {
          "type": "linkedin_message",
          "message": "LinkedIn DM under 250 chars. No pitch."
        }
      ]
    }
  ]
}
```

> **Note:** `{AE_NAME}` and `{AE_FIRST_NAME}` are populated from `ae-config.md` at the root of the repo.
> Before writing any sequence JSON, read ae-config.md and substitute the AE's actual name values.

## Step Types Supported

`automatic_email`, `manual_email`, `phone_call`, `linkedin_connect`, `linkedin_message`, `action_item`

## Step Type Mapping (Standardized Across All Sequences)

| Touch | Day | Step Type | Notes |
|-------|-----|-----------|-------|
| 1 | Day 1 | Automatic email | New thread, unique subject |
| 2 | Day 3 | LinkedIn - connect | No-pitch connection request |
| 3 | Day 5 | Automatic email | Reply to Touch 1 thread |
| 4 | Day 8 | Phone call | Manual call task |
| 5 | Day 10 | Action item | Manual task (e.g., LinkedIn engage / research) |
| 6 | Day 14 | Automatic email | Reply to Touch 1 thread (breakup) |
| 7 | Day 17 | LinkedIn - message | LinkedIn DM, no pitch |

All 4 sequences (A, B, C, D) use this identical 7-touch structure. Touches 3 and 6 use "reply to previous email" step type in Apollo (not "new thread").

## Apollo Sequence Naming Convention

```
YDC | {Company} | Seq A: Engineering Leader
YDC | {Company} | Seq B: Executive Sponsor
YDC | {Company} | Seq C: Product Leader
YDC | {Company} | Seq D: AI/ML Leader
```

## Running the Playwright Script

After writing the JSON file, alert the user to run:

The script lives in the repo; the sequence JSON lives on the Desktop. Use full paths:

```bash
REPO="/Users/andrew/Downloads/Claud_Code_folder/YDCpipeline/apollo-sequence-builder"
JSON="$HOME/Desktop/YDC Pipeline/apollo-sequence-builder/{account}_sequences.json"

# Headless (default, reliable, no window)
cd "$REPO" && node build-sequences.js "$JSON"

# Headed (watch the browser)
cd "$REPO" && HEADED=true node build-sequences.js "$JSON"

# Debug mode (verbose logging + slow motion)
cd "$REPO" && DEBUG=true HEADED=true node build-sequences.js "$JSON"
```

Chrome does NOT need to be closed. build-sequences.js uses its own dedicated profile (`~/.apollo-playwright-profile`) via `launchPersistentContext`, separate from your everyday Chrome. (The "quit Chrome" rule applies only to the LinkedIn task script, which uses a different profile.)

After the script completes, read the `_results.json` file to extract sequence IDs (needed for Phase B contact enrollment) and confirm all sequences were created successfully.
