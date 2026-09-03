# AE Configuration

This is the **only file you need to edit** to set up the pipeline for your account.
Fill in every value below before your first pipeline run. All other files read from here.

**Copy this file to `ae-config.md` and fill in your values. Never commit `ae-config.md` to git.**

---

## Identity

```
AE_NAME: YOUR_FULL_NAME
AE_FIRST_NAME: YOUR_FIRST_NAME
AE_EMAIL: YOUR_EMAIL@you.com
AE_TITLE: API Sales, You.com
```

> These values are injected into outreach sequence signatures, Apollo contact labels,
> and account plan attribution. Use the name exactly as you want it to appear in emails.

---

## Apollo Sequence Builder (Local Playwright Script)

```
APOLLO_BUILDER_PATH: /path/to/your/apollo-sequence-builder
```

> This is where the Node.js Playwright script lives locally. If you placed it
> somewhere else, update this path. The pipeline will reference this when
> prompting you to run build-sequences.js.

---

## Google Drive

```
RCLONE_REMOTE: gdrive
GDRIVE_FOLDER: accountplans
GDRIVE_FOLDER_URL: YOUR_GOOGLE_DRIVE_FOLDER_URL
```

> `RCLONE_REMOTE` is the name of the remote you created with `rclone config` (default: gdrive).
> `GDRIVE_FOLDER_URL` is the Google Drive folder where account plans will be saved.

---

## Sales Deck

```
SALES_DECK_PATH: /path/to/your/sales-deck.pdf
SALES_DECK_URL: YOUR_GOOGLE_SLIDES_URL
```

> Claude reads this file at the start of each pipeline run for pitch framing and positioning.

---

## You.com Research API

```
YDC_API_KEY: YOUR_YDC_API_KEY
YDC_RESEARCH_ENDPOINT: https://api.you.com/v1/research
YDC_SEARCH_ENDPOINT: https://api.you.com/v1/search
```

> Used by ydc-research to auto-generate deep company research (replaces manual ARI PDF step).
> Get your key from the You.com API portal. Rotate at api.you.com if compromised.

---

## ConnectTheDots (CTD)

```
CTD_API_KEY: YOUR_CTD_API_KEY
CTD_CLIENT_ID: YOUR_EMAIL@you.com
```

> Used by the ydc-ctd-warmintro skill to find warm intro paths. Get your key from your CTD account manager.

---

## Account identifiers

```
SFDC_USER_ID: YOUR_SALESFORCE_USER_ID
APOLLO_USER_ID: YOUR_APOLLO_USER_ID
APOLLO_EMAIL_ACCOUNT_ID: YOUR_APOLLO_SENDING_ACCOUNT_ID
SLACK_USER_ID: YOUR_SLACK_USER_ID
SLACK_CHANNEL_ID: YOUR_DEFAULT_SLACK_CHANNEL_ID
```

> The repo is public, so no real IDs live in tracked files. Skills reference them as
> `{SFDC_USER_ID}`, `{APOLLO_USER_ID}`, and so on, and resolve them from this file.
> The Python and Node scripts read the environment first, then fall back to this file.
>
> `SFDC_USER_ID` is your Salesforce User record ID, used in SOQL owner filters.
> `APOLLO_USER_ID` must be sent as `user_id` in the ownership PUT after sequence
> creation, or the sequence stays owned by the API service account and is invisible
> in your Apollo UI. `APOLLO_EMAIL_ACCOUNT_ID` is your sending mailbox.
