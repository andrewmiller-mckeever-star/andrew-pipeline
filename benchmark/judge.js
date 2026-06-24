const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an impartial search-quality judge. Given a query and two sets of web search results labeled A and B, decide which set better answers the query.

Evaluate on:
1. Topical relevance — do the results directly address the query?
2. Coverage — do results cover different useful angles?
3. Snippet informativeness — do snippets convey useful facts, not just navigation text?
4. Freshness signals — for time-sensitive queries, prefer results with recent dates.

Respond with valid JSON only, no markdown fences:
{"winner": "A" | "B" | "tie", "reasoning": "<one sentence>"}`;

function formatResults(results) {
  return results
    .map((r, i) => {
      const date = r.publishedDate ? ` [${r.publishedDate.slice(0, 10)}]` : '';
      const snippet = r.snippet.slice(0, 220).replace(/\n/g, ' ');
      return `${i + 1}. ${r.title}${date}\n   ${snippet}`;
    })
    .join('\n\n');
}

async function compare(query, ydcResults, compResults) {
  // Randomise A/B assignment to reduce position bias
  const flip = Math.random() < 0.5;
  const [a, b] = flip ? [compResults, ydcResults] : [ydcResults, compResults];

  const userContent =
    `Query: "${query}"\n\n` +
    `Result Set A:\n${formatResults(a)}\n\n` +
    `Result Set B:\n${formatResults(b)}`;

  let raw;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userContent }],
    });
    raw = response.content[0].text.trim();
  } catch (err) {
    return { winner: 'tie', reasoning: `Judge API error: ${err.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { winner: 'tie', reasoning: `Judge parse error — raw: ${raw.slice(0, 80)}` };
  }

  const rawWinner = parsed.winner;
  let winner;
  if (rawWinner === 'tie') {
    winner = 'tie';
  } else if ((rawWinner === 'A' && !flip) || (rawWinner === 'B' && flip)) {
    winner = 'ydc';
  } else {
    winner = 'competitor';
  }

  return { winner, reasoning: parsed.reasoning || '' };
}

module.exports = { compare };
