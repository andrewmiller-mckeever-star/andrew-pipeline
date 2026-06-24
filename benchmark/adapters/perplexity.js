const https = require('https');

const NAME = 'Perplexity';

function post(body, headers) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: 'api.perplexity.ai',
        path: '/chat/completions',
        method: 'POST',
        headers: { ...headers, 'Content-Length': buf.length },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode !== 200)
            return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON parse failed')); }
        });
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// Distribute answer sentences across citation URLs so each "result" gets a snippet
function buildResults(answer, citations) {
  if (!citations.length) {
    return [{ title: 'Perplexity Answer', url: '', snippet: answer.slice(0, 400), publishedDate: null }];
  }

  const sentences = answer.match(/[^.!?\n]+[.!?\n]+/g) || [answer];
  const perCite = Math.ceil(sentences.length / citations.length);

  return citations.slice(0, 5).map((url, i) => {
    const chunk = sentences.slice(i * perCite, (i + 1) * perCite).join(' ').trim();
    let domain = url;
    try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* keep raw */ }
    return {
      title: domain,
      url,
      snippet: chunk || answer.slice(i * 150, (i + 1) * 150),
      publishedDate: null,
    };
  });
}

async function search(query) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set');

  const start = Date.now();
  const data = await post(
    {
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1024,
      return_related_questions: false,
      search_recency_filter: 'month',
    },
    { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  );
  const latencyMs = Date.now() - start;

  const answer = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];
  const results = buildResults(answer, citations);

  return { results, latencyMs, rawCount: citations.length };
}

module.exports = { search, NAME };
