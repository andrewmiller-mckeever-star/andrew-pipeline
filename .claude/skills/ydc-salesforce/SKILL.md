---
name: ydc-salesforce
description: CLOUD version for Claude Code Routines. Salesforce CRM intelligence for You.com whale account pipeline, read entirely through the hosted Salesforce connector (read-only soqlQuery). Queries SFDC for account existence, opportunity history (open + closed), contacts, prospect replies, activity timeline, outbound sequence history, and Databricks partnership signals. Outputs structured CRM Intelligence Brief with decision gates. Use when user says "check salesforce for [company]", "SF lookup [company]", "CRM check [company]", "what do we have on [company] in salesforce", or auto-invoked by ydc-research during Step 1.2.
---

# YDC: Salesforce Account Intelligence (Cloud)

## Overview

Primary source of prior account context for the whale pipeline. Replaces Slack keyword search as the structured intelligence layer. Queries 7 dimensions of SFDC data, synthesizes into a CRM Intelligence Brief, and surfaces decision gates that shape downstream pipeline steps.

**Cloud execution notes (differences from the laptop version):**
- All queries run through the account-level claude.ai Salesforce connector (read-only hosted connector). Use the connector tool `soqlQuery` for every query (on the hosted connector the tool name carries a platform suffix, e.g. `soqlQuery…platform_sobject_reads` — locate by function-name suffix, never by a hardcoded `mcp__<uuid>__` prefix or a local directory path). `getObjectSchema` and `getRelatedRecords` are also available if a query needs schema confirmation.
- No Salesforce DX MCP, no `sf` CLI, no local working directory.
- WRITE BOUNDARY: this skill performs NO writes anywhere. It is read-only against Salesforce and prints the CRM Intelligence Brief in chat (or hands it back to the invoking pipeline step). Never write to Salesforce.

## Connection Details

- **Org:** ydc.my.salesforce.com
- **User:** andrew.miller-mckeever@you.com (User ID: `{SFDC_USER_ID}`; override with `SFDC_USER_ID` env var if set)
- **Tool:** Salesforce connector `soqlQuery` (read-only)
- **Opportunity Stages:** 1-Discovery > 2-Qualification > 3-Workshop > 4-Proof of Value > 5-Agreement > Closed Won / Closed Lost
- **Opp Naming Convention:** `{Account} | {New/Renewal} | ${Amount} | {Product(s)}`

## Execution

### Model Routing

- **Subagent (fast model):** Fires all 7 SOQL queries in parallel. Returns raw JSON results.
- **Main thread:** Receives raw results. Synthesizes into CRM Intelligence Brief. Evaluates decision gates. Merges with research and Slack context for final Step 1 output. (Model routing is advisory in cloud — if subagents are unavailable, run the queries directly in the main thread.)

### When Invoked by ydc-research (Step 1.2)

Runs as a subagent in parallel with the Google Drive check (Step 1.1). Results are passed back to the main thread for synthesis.

### When Invoked Standalone

Run all 7 queries, synthesize the CRM Intelligence Brief, and print it directly in chat.

---

## The 7 SOQL Queries

Run ALL queries in parallel (they are independent). Replace `{Company}` with the target account name.

### Q1: Account Existence + Ownership + Databricks Partnership

```sql
SELECT Id, Name, OwnerId, Owner.Name, Industry, Type, CreatedDate,
       Databricks_Status__c, Target_Account_2__c, Partner_Relationship_Lead__c,
       Opportunity_Status__c, Total_Revenue_Closed_Won__c, Count_of_Open_Opportunities__c
FROM Account WHERE Name LIKE '%{Company}%'
```

**What it tells you:**
- Does the account exist in SF?
- Who owns it?
- Account type: Prospect, Customer, Churn, Out of Business, Partner
- Databricks partnership: is this a Databricks customer? Flagged as API target? Who is the DB AE?
- Rollup metrics: total closed-won revenue, count of open opps

### Q2: Full Opportunity History (open + closed)

```sql
SELECT Id, Name, StageName, Amount, CloseDate, OwnerId, Owner.Name, CreatedDate, IsClosed, IsWon
FROM Opportunity WHERE Account.Name LIKE '%{Company}%' ORDER BY CloseDate DESC
```

**What it tells you:**
- Active pipeline: stage, amount, product mix (parsed from opp name), close date, owner
- Won deals: what they bought, when, how much
- Lost deals: what product was pitched, what stage it died at, when

**Product parsing:** Opp names follow `{Account} | {New/Renewal} | ${Amount} | {Products}`. Extract the product string after the last pipe. Known products: Custom Agent API, API Credit, Web + News Search API, Team Plan, Max Plan, Enterprise Seat Licenses, ESL.

### Q3: Contacts Already in SF

```sql
SELECT Id, Name, Title, Email, Phone, OwnerId, Owner.Name, CreatedDate
FROM Contact WHERE Account.Name LIKE '%{Company}%' ORDER BY CreatedDate DESC
```

**What it tells you:**
- Who at this account already has a SF record
- Their titles, emails, owners
- Critical for dedup against Apollo prospect list in Step 3

### Q4: Prospect Replies (Highest-Value Signal)

```sql
SELECT Id, Subject, Description, ActivityDate, Who.Name, Owner.Name, TaskSubtype
FROM Task WHERE Account.Name LIKE '%{Company}%'
AND Subject LIKE '[Gong In]%' AND TaskSubtype = 'Email'
ORDER BY ActivityDate DESC LIMIT 15
```

**What it tells you:**
- Which prospects REPLIED to our outreach (inbound signal)
- Full thread content in Description field (includes what they said)
- Who they replied to, when

**Activity prefix key (confirmed on live data):**
- `[Gong In]` = inbound prospect reply (THE warm path signal)
- `[Gong Out]` = outbound email logged by Gong
- `[Apollo >>]` = outbound email sent via Apollo sequence
- `Email:` = outbound from other tools (Outreach, etc.)

**Thread propagation:** For each `[Gong In]` result, extract the prospect's reply text from the Description field. The Description contains the full email with From/To/CC headers and body. Surface the reply content and key context from the thread below it.

### Q5: Full Activity History (Last 12 Months)

```sql
SELECT Id, Subject, ActivityDate, Who.Name, Owner.Name, TaskSubtype
FROM Task WHERE Account.Name LIKE '%{Company}%' AND ActivityDate >= LAST_N_DAYS:365
ORDER BY ActivityDate DESC LIMIT 30
```

**What it tells you:**
- Complete touch timeline: who contacted whom, when, via what channel
- Do NOT pull Description here (too heavy for overview). Use Q4 for reply details.
- Calculate: last touch date, engagement gap (days since last activity)

### Q6: Outbound Sequence Touches (Apollo)

```sql
SELECT Id, Subject, ActivityDate, Who.Name, Owner.Name
FROM Task WHERE Account.Name LIKE '%{Company}%'
AND Subject LIKE '[Apollo >>]%'
ORDER BY ActivityDate DESC LIMIT 20
```

**What it tells you:**
- Which Apollo sequences were run against this account
- Which contacts were touched in each sequence
- Date ranges of outbound activity
- Prevents re-running the same plays against the same people

**Sequence parsing:** Apollo task subjects follow `[Apollo >>] [Email] {Subject} - [Seq: {Sequence Name}]`. Extract the sequence name to identify which pipeline sequences have already been executed.

### Q7: Andrew's Current Pipeline (Context)

```sql
SELECT Id, Name, StageName, Amount, CloseDate, Account.Name
FROM Opportunity WHERE OwnerId = '{SFDC_USER_ID}' AND IsClosed = false ORDER BY CloseDate ASC
```

**What it tells you:**
- Andrew's full open pipeline (not account-specific)
- Context for capacity and priority decisions

---

## CRM Intelligence Brief Output Format

This replaces Section 9 ("Slack Context") in the research output. New name: **"CRM Intelligence & Prior Engagement"**

```
## 9. CRM Intelligence & Prior Engagement

### Account Status
- SF Account: {Exists / Does not exist}
- Owner: {Name}
- Account Type: {Prospect / Customer / Churn / Partner / blank}
- Industry: {value}

### Databricks Partnership
- Databricks Customer: {Yes/No}
- Target Account: {API / blank}
- DB AE: {Partner_Relationship_Lead__c value}
- DB Pipeline Status: {Opportunity_Status__c value}
(Only include this section if Databricks_Status__c is not null)

### Prospect Replies (Warm Paths)
| Date | Contact | Subject | Reply Summary |
|------|---------|---------|---------------|
| {date} | {Who.Name} | {subject minus prefix} | {1-2 sentence summary of what they said} |

For each reply, propagate key thread context below the table row:
> Thread: {relevant context from the Description field showing the conversation flow}

**Key Insight:** {1-2 sentence synthesis of what these replies mean for outreach strategy}

(If no [Gong In] replies found: "No inbound replies detected. Full cold approach.")

### Opportunity History
| Opp Name | Stage | Amount | Close Date | Owner | Status |
|----------|-------|--------|------------|-------|--------|

**Products Previously Pitched:** {list}
**Products Previously Won:** {list with amounts}
**Products Previously Lost:** {list with stage where each died}

(If no opps: "No opportunity history.")

### Existing Contacts in SF
| Name | Title | Email | Owner | Created |
|------|-------|-------|-------|---------|

(If no contacts: "No contacts in SF.")

### Activity Timeline (Last 12 Months)
| Date | Type | Subject | Contact | Owner |
|------|------|---------|---------|-------|

**Last Touch:** {date and type of most recent activity}
**Engagement Gap:** {days since last activity}

(If no activity: "No activity in the last 12 months.")

### Outbound Sequences Already Run
| Sequence Name | Contacts Touched | Date Range |
|---------------|-----------------|------------|

(Parsed from [Apollo >>] task subjects. If none: "No Apollo sequences detected.")

### Pipeline Decision Gates
- ACTIVE OPP CHECK: {PASS / WARNING: {opp details}}
- PRIOR REJECTION CHECK: {PASS / WARNING: {product} lost at {stage} on {date}, contact: {name}}
- CONTACT DEDUP: {list of SF contacts to cross-reference in Step 3, or "No SF contacts to dedup"}
- PRODUCT MIX: {Net-new / Expansion (existing customer with ${amount} closed-won)}
- DATABRICKS CO-SELL: {Not a DB customer / DB customer, AE: {name}, consider co-sell coordination}
```

---

## 5 Decision Gates

### Gate 1: Active Opportunity (Warning)

If Q2 returns open opps (IsClosed = false):
- Surface: opp name, stage, amount, owner, close date
- If Andrew owns the active opp: pipeline proceeds but outreach should reference existing relationship, not cold-pitch
- If someone else owns it: flag for coordination ("Active opp owned by {Name}. Coordinate before outreach.")

### Gate 2: Closed-Lost Intelligence (Strategy Adjust)

If Q2 returns closed-lost opps (IsClosed = true, IsWon = false):
- Extract: product pitched (from opp name), stage where it died, primary contact (from Q4/Q5 activity), close date
- If lost at Discovery/Qualification: they never got deep. Standard cold approach is fine.
- If lost at Workshop/POV/Agreement: they evaluated and rejected. Lead with a DIFFERENT product angle. Deprioritize the contact who was primary on the lost deal.
- If loss was 2+ years ago: treat as re-engagement. "The product has evolved significantly" angle.
- If loss was < 6 months ago: proceed with caution. May need different persona or a warm intro path.

### Gate 3: Contact Dedup

Pass the full Q3 contact list to Step 3 (prospect discovery). When Apollo returns prospects:
- If a prospect is already in SF WITH activity history: they have been contacted before. Flag them.
- If a prospect is in SF but has ZERO activity: imported but never engaged. Safe to include.
- Prevents cold-emailing someone who already has an active relationship.

### Gate 4: Product Mix Intelligence

If Q2 shows closed-won opps:
- This is an EXISTING CUSTOMER. The pipeline is expansion/cross-sell, not net-new cold.
- Extract: what products they already pay for, amounts, renewal dates
- Outreach should reference the existing partnership and position new capabilities
- If only closed-lost or no opps: net-new cold pipeline

### Gate 5: Databricks Partnership Signal

If Q1 returns `Databricks_Status__c = 'Customer'`:
- This account is a Databricks customer (co-sell target list)
- Note the DB AE name from `Partner_Relationship_Lead__c`
- Check `Target_Account_2__c` for "API" flag (prioritized target)
- Check `Opportunity_Status__c` for existing DB pipeline status
- Include in account plan: co-sell potential, DB AE for coordination
- If not a Databricks customer: omit this section entirely

---

## Pipeline-End Summary: Warm Replies & Paths

At the END of every full pipeline run (after Step 6), print this in chat:

```
=== WARM PATHS & REPLY HISTORY: {Company} ===

PROSPECT REPLIES (from SF):
1. {Contact Name} ({Title}) replied on {Date}
   Subject: {subject}
   Reply: {extracted reply text from Description}
   Thread: {key context from full thread}

2. ...

(If no replies: "No inbound prospect replies found in SF.")

ACTIVE WARM PATHS:
- {Contact}: {status of conversation, next step if visible from thread}

OUTBOUND ALREADY SENT:
- {Sequence Name}: {contact names} ({date range})
- ...

RECOMMENDATION: {1-2 sentences on how to approach given warm path context}
```

This prints in the chat at pipeline end. Not saved to a document.

---

## Edge Cases

### Net-new account (no SF record)
All gates pass automatically. Brief output:
> "No Salesforce record found for {Company}. Net-new account with no prior engagement history. Full cold pipeline."

### Account exists but zero activity
> "Salesforce Account exists (Owner: {Name}) but has no opportunities or activities. Account was likely imported from a list but never worked. Proceeding with cold pipeline."

### Existing customer (only closed-won opps)
> "WARNING: {Company} is an existing customer with ${Amount} in closed-won pipeline ({Products}). This is a cross-sell/expansion motion, not net-new cold outreach. Outreach should reference the existing partnership."

### Multiple owners across opps
Note all owners and their opp outcomes. Different reps may have worked the account at different times. Surfaces the political landscape and who has context.

### SOQL query failure
Log the error. Proceed without CRM context. SFDC intelligence is high-value but not blocking. Surface error to user:
> "SFDC query failed: {error}. Proceeding without CRM context. Consider checking Salesforce manually for {Company}."

### Salesforce connector not connected/authorized
Same treatment as query failure: note "Salesforce connector unavailable — proceeding without CRM context" and continue the pipeline.

---

## Cross-Pipeline Integration

| Pipeline Step | How SFDC Data Is Used |
|---|---|
| Step 1 (Research) | Section 9 of research output. Decision gates evaluated. |
| Step 2 (Account Plan) | Auto-populate Section 1 fields (Existing Relationship Notes, Internal Ownership, Renewal Details). Inform Section 2 (Strategic Context) and Section 8 (Outreach Strategy). |
| Step 3 (Prospects) | Contact dedup against SF contacts. Flag prospects with prior activity. |
| Step 3.5 (Warm Intro) | SF contacts with positive replies become warm intro targets. |
| Step 4 (Outreach) | Product angle adjusted if prior products were lost. Contact-level hooks adjusted for prior engagement. Cold vs warm tone calibrated. |
| Step 6B (Apollo) | SF Contact IDs noted for CRM sync reference. |
| Pipeline End | Warm reply summary printed in chat. |

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/ydc-salesforce | Migration to Claude Code Routines: `run_soql_query` (Salesforce DX MCP with local directory) replaced by hosted Salesforce connector `soqlQuery` located by function-name suffix; local directory reference removed; explicit read-only write boundary and connector-unavailable edge case added |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
| (prior) | Added Q4: Prospect Replies ([Gong In] prefix) as a dedicated query | Inbound replies were the highest-value signal but weren't being systematically detected; buried in general activity timeline |
| (prior) | Added thread propagation for [Gong In] replies (Description field extraction) | Reply content in SF Description field contains the full conversation; extracting it gives full context |
| (prior) | Added 5 decision gates (Active Opp, Closed-Lost, Contact Dedup, Product Mix, Databricks) | Previous version surfaced raw data without structured guidance on how to act on each signal |
| (prior) | Added Q6: Outbound Sequence Touches ([Apollo >>] prefix) | Sequences were being re-run against contacts who had already been touched; Apollo task subjects parsed to detect prior sequences |
| (prior) | Added Databricks partnership fields (Q1: Databricks_Status__c, Partner_Relationship_Lead__c) | Databricks co-sell is a structured signal in SFDC; wasn't being surfaced or used in pipeline decisions |
