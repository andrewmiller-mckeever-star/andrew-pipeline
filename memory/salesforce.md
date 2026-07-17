---
name: Salesforce Integration
description: SFDC org schema, activity prefix patterns, Databricks partnership fields, and pipeline integration for You.com sales org. Full query specs in ydc-salesforce skill.
type: reference
---

# Salesforce Integration

## Connection Details
- **Org:** ydc.my.salesforce.com
- **User:** andrew.miller-mckeever@you.com (User ID: `005Vq000009j4ezIAA`)
- **Org ID:** 00Dfo000003ZI8QEAW
- **API Version:** 66.0
- **Auth (laptop):** Salesforce CLI (`sf org login web`); MCP package `@salesforce/mcp` (via npx, toolsets: core,data,orgs,users), primary tool `run_soql_query`
- **Auth (cloud):** account-level Salesforce connector (hosted, read-only) — primary tool `soqlQuery`, plus `getObjectSchema`, `getRelatedRecords`
- **Skill:** `skills/ydc-salesforce/SKILL.md` (laptop) / `.claude/skills/ydc-salesforce/SKILL.md` (cloud) — full query specs, output format, decision gates

## Org Schema

### Opportunity Stages
1-Discovery > 2-Qualification > 3-Workshop > 4-Proof of Value > 5-Agreement > Closed Won / Closed Lost

### Opp Naming Convention
`{Account} | {New/Renewal} | ${Amount} | {Product(s)}`
Products: Custom Agent API, API Credit, Web + News Search API, Team Plan, Max Plan, Enterprise Seat Licenses, ESL

### Account Type Picklist
Prospect, Customer, Churn, Out of Business, Partner

### Activity Prefix Patterns (Confirmed 2026-03-25 on Brex)
- `[Gong In]` = inbound prospect reply (warm path signal)
- `[Gong Out]` = outbound email logged by Gong
- `[Apollo >>]` = outbound email sent via Apollo sequence
- `Email:` = outbound from other tools

### Databricks Partnership Fields (on Account object)
- `Databricks_Status__c`: "Customer" = Databricks customer
- `Target_Account_2__c`: "API" = flagged as API target
- `Partner_Relationship_Lead__c`: DB AE name (e.g., "Jeff Zook (DB AE)")
- `Opportunity_Status__c`: DB pipeline status (e.g., "Opportunity Created")
- `Total_Revenue_Closed_Won__c`, `Count_of_Open_Opportunities__c`: rollup metrics

## Pipeline Integration

SFDC is the primary CRM intelligence source for the whale pipeline (Step 1.2). Full implementation in `ydc-salesforce` skill. Key integration points:

- **Step 1.2:** 7 SOQL queries run in parallel (Sonnet subagent). Output: CRM Intelligence Brief (Section 9 of research).
- **Step 2:** Auto-populates account plan Section 1 fields (Relationship Notes, Ownership, Renewal Details).
- **Step 3:** Contact dedup against SF contacts. Flags prospects with prior activity or [Gong In] replies.
- **Step 4:** Product angle adjusted for closed-lost history. Warm tone for contacts with prior engagement.
- **Pipeline End:** Warm reply summary printed in chat (prospect replies, active paths, outbound history).

## 5 Decision Gates
1. Active Opportunity (warning if open opps exist)
2. Closed-Lost Intelligence (adjust product angle, deprioritize same contact)
3. Contact Dedup (cross-reference with Apollo Step 3)
4. Product Mix (net-new vs expansion)
5. Databricks Partnership Signal (co-sell potential, DB AE coordination)
