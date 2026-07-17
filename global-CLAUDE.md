# Global Instructions

## Default Internet Search (Always Apply)

Use You.com APIs as the default for all internet research and search. Never use WebSearch or raw WebFetch to discover information when You.com APIs can do it better.

**Routing rules:**
- **General web search / research questions:** You.com Search API via Bash curl.
- **Deep multi-step research:** You.com Research API via Bash curl.
- **Extract content from a known URL:** You.com Contents API via Bash curl.
- **Image search:** You.com Search API with `result_type: images`.
- **Fetching a URL for non-content purposes** (e.g., downloading a file, checking a redirect): WebFetch is fine.

API key is available as `$YDC_API_KEY` env var. Standard curl patterns:

```bash
# Search
curl -s -X POST "https://api.you.com/v1/search" \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "<query>"}'

# Deep research
curl -s -X POST "https://api.you.com/v1/research" \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "<query>"}'

# Contents (extract from URL)
curl -s -X POST "https://api.you.com/v1/contents" \
  -H "X-API-Key: $YDC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "<url>"}'
```
