# Apollo Sequence Builder

Automated Apollo.io sequence creation via Playwright. Runs locally so browser automation errors don't burn Claude tokens.

## Setup

```bash
cd ~/Desktop/apollo-sequence-builder
npm install
```

## Usage

```bash
# Headless (fast, no browser window)
node build-sequences.js plaid_sequences.json

# Headed (watch the browser - recommended for first run)
HEADED=true node build-sequences.js plaid_sequences.json

# Debug mode (verbose logging + slow motion)
DEBUG=true HEADED=true node build-sequences.js plaid_sequences.json
```

## How it works

1. Launches Chrome using your existing profile (preserves Apollo login)
2. Dismisses any UI alerts, banners, modals, or toasts
3. Creates each sequence from the JSON data file
4. For each step: selects the correct type, fills subject/body/notes
5. Email bodies are injected via Quill editor DOM manipulation (same technique as Claude browser automation, but without the token cost)
6. Saves each sequence and verifies content
7. Outputs a results summary + writes a `_results.json` file

## Important

- **Sequences are left INACTIVE.** Review and activate manually in Apollo.
- **Requires Apollo login.** The script uses your existing Chrome profile. If not logged in, run with `HEADED=true` and log in manually when prompted.
- **First run: use HEADED=true** so you can watch and catch any selector issues.

## JSON Data Format

See `schema.example.json` for the full schema. Each sequence has a name and array of steps:

| Step Type | Required Fields |
|-----------|----------------|
| `automatic_email` | `body`, optionally `subject` (Touch 1), `email_type` (`new_thread` or `reply`) |
| `phone_call` | `task_note` (call script) |
| `linkedin_connect` | `message` (connect note) |
| `linkedin_message` | `message` |
| `action_item` | `task_note` |

## Troubleshooting

- **"Not logged into Apollo"**: Run with `HEADED=true`, log in manually, re-run
- **Chrome profile conflict**: Close all Chrome windows first, or set `CHROME_PROFILE_DIR=Profile\ 1` for an alternate profile
- **Blank editors after save**: The script detects this and logs a warning. Check the `_results.json` for details on which step needs manual fix.
- **Selector changes**: If Apollo updates their UI, the key selectors to update are in `addStep()` and `configureEmailStep()`.
