---
name: ydc-linkedin-signals
description: Pre-outreach LinkedIn engagement pipeline. Visits each prospect's LinkedIn activity feed via chrome-cdp, likes recent posts (last 2 weeks), and generates comment suggestions for prospects with original content. Use when user says "linkedin signals for [company]", "pre-outreach engagement for [company]", "warm up linkedin for [company]", "like pipeline for [company]", or "linkedin engagement for [company]". Standalone skill, not a mandatory pipeline step. Best run with Sonnet for compute efficiency.
---

# YDC: LinkedIn Signals (Pre-Outreach Engagement)

## Purpose

Drop lightweight engagement signals (likes + comments) on prospect LinkedIn posts before outreach sequences go live. Warms up your profile in their notifications so your name is familiar when the first email lands.

## When to Use

- Before activating Apollo sequences for an account
- Before a meeting or demo with a prospect
- Before a conference where you'll see target contacts
- Anytime you want to warm up an account's LinkedIn awareness

## Inputs

The skill needs a list of prospect names + LinkedIn URLs. Sources (in priority order):

1. **Apollo contacts search** for the account (preferred — already has LinkedIn URLs)
2. **Prospect list from a prior pipeline run** (check `collibra_sequences.json`, etc.)
3. **Manual list** provided by user

## Tool: chrome-cdp

All browser automation uses the chrome-cdp skill at:
```
/Users/andrew/.claude/skills/chrome-cdp/skills/chrome-cdp/scripts/cdp.mjs
```

Alias for readability in this doc: `CDP`

**Prerequisites:**
- Chrome running with remote debugging enabled (`chrome://inspect/#remote-debugging`)
- The user must be logged into LinkedIn in Chrome

### Key commands used

| Command | Purpose |
|---------|---------|
| `list` | Find a LinkedIn tab target ID |
| `nav <target> <url>` | Navigate to prospect's activity page |
| `eval <target> <js>` | Read timestamps, post text, click Like buttons |
| `shot <target> <file>` | Screenshot for verification (use sparingly) |

## Procedure

### Step 1: Get prospect list with LinkedIn URLs

```
Apollo contacts search → q_keywords: "[Company Name]" → extract name, title, linkedin_url
```

If Apollo has no contacts for the account, ask the user for LinkedIn URLs or search Apollo People API.

### Step 2: Get a Chrome tab target

```bash
node $CDP list 2>&1 | grep -i linkedin
```

If no LinkedIn tab exists, use any tab and navigate to LinkedIn. Store the target ID.

### Step 3: For each prospect, scan activity

Navigate to their activity page and read timestamps in one eval call:

```bash
node $CDP nav $TAB "https://www.linkedin.com/in/{slug}/recent-activity/all/"
sleep 2
node $CDP eval $TAB 'var times = document.querySelectorAll("span.update-components-actor__sub-description span[aria-hidden=\"true\"]"); var r = []; for(var i=0;i<5&&i<times.length;i++) r.push(times[i].textContent.trim()); "TIMESTAMPS: " + (r.length ? r.join(" | ") : "NO POSTS")'
```

**Recency threshold:** Only engage with posts from the last **2 weeks** (14d). Anything older, skip.

Timestamps LinkedIn uses: `Xh`, `Xd`, `Xw`, `Xmo`, `Xyr`. Anything showing `h`, `d`, or `1w`/`2w` is in scope.

### Step 4: Like recent posts

For each prospect with recent posts, click Like via JS eval:

```bash
node $CDP eval $TAB 'var b = document.querySelectorAll("button[aria-label=\"React Like\"]")[0]; b.click(); "Liked"'
```

**Rules:**
- Like up to **2 posts per prospect** (don't over-engage)
- Prefer **original posts** over reposts
- If the first Like button is gone (already liked from a prior pass), the next `querySelectorAll` index shifts. Always use `[0]` after each like since the liked button changes its label.
- Verify by checking button count decreases: `document.querySelectorAll("button[aria-label=\"React Like\"]").length`

### Step 5: Capture post content for comment suggestions

For prospects with original, substantive posts (not hiring announcements or company reposts), read the post text:

```bash
node $CDP eval $TAB 'var spans = document.querySelectorAll(".feed-shared-update-v2__description .break-words span[dir=\"ltr\"]"); var text = ""; for(var i=0;i<spans.length;i++) text += spans[i].textContent; text.substring(0, 600)'
```

Store the content for comment generation at the end.

### Step 6: Generate comment suggestions

After all prospects are scanned, generate comment suggestions for the **top 3-5 prospects** with the most engaging original content.

**Comment rules:**
- No product mentions (no You.com, no Search API, no MCP)
- No pitch, no CTA, no "we should connect"
- Demonstrate domain expertise relevant to their post topic
- Ask a genuine follow-up question when possible
- 2-3 sentences max
- Written in Andrew's voice: plain, direct, knowledgeable peer tone
- No AI-isms, no glazing, no generic flattery

### Step 7: Output summary

Produce a summary table with three sections:

1. **Posts Liked** — Prospect name, title, post topic, age, original vs repost
2. **Comment Suggestions** — Prospect name, post context, suggested comment text
3. **No Recent Content** — Prospects with no posts in the last 2 weeks and their most recent post age

## Compute Efficiency Notes

- **Use Sonnet** for this skill. It's browser automation, not synthesis.
- **Skip screenshots** unless something looks wrong. Trust the JS eval output for timestamps and like button counts.
- **One eval per prospect** for timestamps. Don't read the full accessibility tree.
- **Batch reasoning.** Don't deliberate on each prospect individually. Scan timestamps → if recent, like → move on. Save the thinking for comment generation at the end.
- **Don't expand "see more" buttons** unless the prospect is a comment candidate. Most posts don't need full text.

## Selector Reference

These LinkedIn selectors are current as of March 2026:

| Element | Selector |
|---------|----------|
| Post timestamps | `span.update-components-actor__sub-description span[aria-hidden="true"]` |
| Like button (unliked) | `button[aria-label="React Like"]` |
| Post text (expanded) | `.feed-shared-update-v2__description .break-words span[dir="ltr"]` |
| See more button | `button.feed-shared-inline-show-more-text__see-more-less-toggle` |
| Repost indicator | `.update-components-header__text-view` (presence = repost) |

**If selectors break:** LinkedIn updates its DOM periodically. Take a screenshot, read the page structure, and update selectors in this file.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| 2026-03 | Updated selectors to current LinkedIn DOM (March 2026) | LinkedIn periodically obfuscates class names; replaced class-based selectors with stable aria/attribute selectors |
