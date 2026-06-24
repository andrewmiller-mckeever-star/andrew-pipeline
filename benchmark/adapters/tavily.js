const https = require('https');

const NAME = 'Tavily';

function post(body, headers) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: 'api.tavily.com',
        path: '/search',
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

function normalizeHit(hit) {
  return {
    title: hit.title || '(no title)',
    url: hit.url || '',
    snippet: hit.content || hit.description || hit.raw_content || '',
    publishedDate: hit.published_date || null,
  };
}

async function search(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not set');

  const start = Date.now();
  const data = await post(
    { query, max_results: 5, include_answer: false, include_raw_content: false },
    { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  );
  const latencyMs = Date.now() - start;

  const rawHits = data.results || [];
  return { results: rawHits.slice(0, 5).map(normalizeHit), latencyMs, rawCount: rawHits.length };
}

module.exports = { search, NAME };
