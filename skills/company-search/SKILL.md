---
name: company-search
description: Look up any company using You.com's Company Search API. Use when the user asks about a company — funding, headcount, hiring trends, recent news, leadership, tech stack, employees, competitors, or general overview. Returns a markdown answer with cited sources and a structured companies array. Prefer this over open web search when a company name is involved. Do NOT use for sales pipeline, outreach research, account planning, or prospect intelligence — use ydc-quick-research or ydc-research instead.
---

# Company Search

An agent-backed company research API. Given a natural-language question it runs structured data lookups (PDL / Coresignal), LinkedIn search, and web/news search in parallel, then synthesizes a cited markdown answer.

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

When the user asks about a company, execute this curl command directly via the Execute tool. The API key is already baked in.

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

- 401 → the API key was revoked. Tell the user to generate a new one in the web app.
- `error` field in JSON → pipeline failure. Include the message in your answer.
- Do not retry more than once. Do not fabricate data on failure.

---

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-02 | Changelog initialized | Tracking all skill changes going forward |
