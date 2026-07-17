---
name: company-search
description: CLOUD version for Claude Code Routines. Look up any company using You.com's Company Search API (key from the $COMPANY_SEARCH_API_KEY env var). Use when the user asks about a company — funding, headcount, hiring trends, recent news, leadership, tech stack, employees, competitors, or general overview. Returns a markdown answer with cited sources and a structured companies array. Prefer this over open web search when a company name is involved. Do NOT use for sales pipeline, outreach research, account planning, or prospect intelligence — use ydc-quick-research or ydc-research instead.
---

# Company Search (Cloud)

An agent-backed company research API. Given a natural-language question it runs structured data lookups (PDL / Coresignal), LinkedIn search, and web/news search in parallel, then synthesizes a cited markdown answer.

**Cloud execution notes:**
- Auth comes from the `$COMPANY_SEARCH_API_KEY` env var set in the cloud environment. Never hardcode or print the key.
- If `$COMPANY_SEARCH_API_KEY` is unset (or empty), degrade gracefully: answer the question with the You.com Search connector (`you-search`) and/or WebSearch instead, and tell the user the Company Search API key is not configured in this environment. Do not abort.
- WRITE BOUNDARY: this skill performs NO writes anywhere. One outbound REST call; the answer prints in chat.

## When to use this skill

Trigger on queries like:
- "Tell me about Stripe"
- "What's Anthropic's headcount growth?"
- "Recent funding for Cursor"
- "Who are OpenAI's recent exec hires?"
- "VCs that closed a new fund in 2025"
- "Is <company> hiring in engineering?"

Do **not** use for: non-company questions (general facts, code, math), queries where the user explicitly asks for raw web search, or any sales/pipeline context (outreach research, account plans, prospect discovery, pipeline runs — use `ydc-quick-research` or `ydc-research` for those).

## How to call

When the user asks about a company, execute this curl command directly via Bash. The API key comes from the `$COMPANY_SEARCH_API_KEY` env var — check it is set first (`[ -n "$COMPANY_SEARCH_API_KEY" ]`); if not, use the degraded fallback above.

```bash
curl -sS --max-time 240   -X POST "https://youdotcom-company-search-production.up.railway.app/proxy/v1/companies"   -H "Authorization: Bearer $COMPANY_SEARCH_API_KEY"   -H "Content-Type: application/json"   -d '{"query":"Tell me about Stripe","synthesis":true}'
```

Substitute the `query` field with the user's question. Always set `synthesis: true`.

The response is a single JSON object on stdout.

## Request body

| field | type | default | notes |
|---|---|---|---|
| `query` | string | **required** | the user's question |
| `synthesis` | bool | true | narrative markdown answer |
| `thread_id` | string | none | pass from prior response for follow-ups |
| `profile_count` | int | 5 | how many company profiles to return |
| `web_count` | int | 10 | web results |
| `news_count` | int | 10 | news results |
| `use_web_search` | bool | true | set false for structured data only |

## Response

```json
{
  "query": "Tell me about Stripe",
  "thread_id": "uuid-for-followups",
  "answer": "# Stripe\n\nStripe is a ...",
  "companies": [{ "name": "Stripe", "website": "stripe.com" }],
  "web_results": { "web": [...], "news": [...] },
  "tool_calls": [{ "tool": "...", "args": {...} }],
  "latency_ms": 12345,
  "error": null
}
```

Surface `answer` to the user as-is (already markdown). Include the `thread_id` if follow-ups are expected.

## Follow-up queries

For follow-ups, pass the previous `thread_id` in the same curl command:

```bash
curl -sS --max-time 240   -X POST "https://youdotcom-company-search-production.up.railway.app/proxy/v1/companies"   -H "Authorization: Bearer $COMPANY_SEARCH_API_KEY"   -H "Content-Type: application/json"   -d '{"query":"What about their funding?","thread_id":"<previous-thread-id>","synthesis":true}'
```

## Errors

- 401 → the API key was revoked or `$COMPANY_SEARCH_API_KEY` holds a stale value. Tell the user to generate a new key in the web app and update the env var in the cloud environment settings.
- `error` field in JSON → pipeline failure. Include the message in your answer.
- Do not retry more than once. Do not fabricate data on failure. If the API is unreachable, fall back to the You.com Search connector / WebSearch and say so.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-17 | Cloud port created from skills/company-search | Migration to Claude Code Routines: fixed stale "API key is already baked in" note (key now comes from $COMPANY_SEARCH_API_KEY env var), added degraded fallback (You.com Search connector / WebSearch) when the key is unset, added explicit no-write boundary |
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
