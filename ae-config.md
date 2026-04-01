# AE Configuration

This is the **only file you need to edit** to set up the pipeline for your account.
Fill in every value below before your first pipeline run. All other files read from here.

---

## Identity

```
AE_NAME: Nick Opderbeck
AE_FIRST_NAME: Nick
AE_EMAIL: nick.opderbeck@you.com
AE_TITLE: API Sales, You.com
```

> These values are injected into outreach sequence signatures, Apollo contact labels,
> and account plan attribution. Use the name exactly as you want it to appear in emails.

---

## Apollo Sequence Builder (Local Playwright Script)

```
APOLLO_BUILDER_PATH: /Users/nick/ydc-sales-pipeline/apollo-sequence-builder
```

> This is where the Node.js Playwright script lives locally. If you placed it
> somewhere else, update this path. The pipeline will reference this when
> prompting you to run build-sequences.js.

---

## Google Drive

```
RCLONE_REMOTE: gdrive
GDRIVE_FOLDER:
GDRIVE_FOLDER_URL:
```

> `RCLONE_REMOTE` is the name of the remote you created with `rclone config` (default: gdrive).
> `GDRIVE_FOLDER_URL` is the Google Drive folder where account plans will be saved.

---

## Sales Deck

```
SALES_DECK_PATH:
SALES_DECK_URL:
```

> Claude reads this file at the start of each pipeline run for pitch framing and positioning.

---

## ConnectTheDots (CTD)

```
CTD_API_KEY: uak_E4WNasx-S6CH2r3XMR8mrhkeHRmkXU76
CTD_CLIENT_ID: nick.opderbeck@you.com
```

> Used by the ydc-ctd-warmintro skill to find warm intro paths. Get your key from jelena@ctd.ai if it expires.
