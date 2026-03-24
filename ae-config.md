# AE Configuration

This is the **only file you need to edit** to set up the pipeline for your account.
Fill in every value below before your first pipeline run. All other files read from here.

---

## Identity

```
AE_NAME:        Nick Opderbeck
AE_FIRST_NAME:  Nick
AE_EMAIL:       nick@you.com
AE_TITLE:       API Sales, You.com
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
RCLONE_REMOTE:    gdrive
GDRIVE_FOLDER_URL: https://drive.google.com/drive/folders/1LQt3Bccyplg3vbP37H0BrzMazDKc2FFj
```

> `RCLONE_REMOTE` is the name of the remote you created with `rclone config` (default: gdrive).
> `GDRIVE_FOLDER_URL` is the Google Drive folder where account plans will be saved.

---

## Sales Deck

```
SALES_DECK_PATH: /Users/nick/ydc-sales-pipeline/downloads/You.com - API Pitch Deck - 10.30.25.pptx
```

> Local path to the downloaded sales deck. Set automatically by the setup wizard.
> Claude reads this file at the start of each pipeline run for pitch framing and positioning.
